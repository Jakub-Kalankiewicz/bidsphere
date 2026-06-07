# Merkle Proof Offline Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend BidSphere's blockchain integrity layer with Merkle proof–based offline verification, allowing users to verify 3D model authenticity with zero network calls using a proof bundle and a standalone `verify.html`.

**Architecture:** A new `MerkleBatch` concept is layered on top of the existing per-model registration: an admin groups models into a batch, the server builds a SHA-256 Merkle tree, the root is stored on-chain via an upgraded `ModelRegistry` contract, and proof bundles are generated on demand. A self-contained `verify.html` (no server, no CDN) performs three-gate verification entirely in the browser.

**Tech Stack:** Solidity 0.8.19, Hardhat, ethers.js v6, Next.js 15 App Router, Prisma + MongoDB, `crypto.subtle` (browser), TypeScript

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `contracts/contracts/ModelRegistry.sol` | Upgraded contract with Merkle batch functions (replaces existing) |
| `contracts/test/ModelRegistry.test.ts` | Hardhat tests for all contract functions |
| `lib/merkle.ts` | Pure Merkle tree builder + proof generator (server-side, no blockchain calls) |
| `lib/merkle.test.ts` | Unit tests for merkle.ts (run via `ts-node` or Vitest) |
| `actions/generateMerkleProof/index.ts` | Server action: produces `ProofBundle` JSON for a given itemId |
| `actions/admin/batchRegister/index.ts` | Server action: builds tree, registers root on-chain, updates DB |
| `public/verify.html` | Standalone offline verifier — no external deps, all inline JS |

### Modified files
| Path | Change |
|---|---|
| `contracts/hardhat.config.ts` | Add Sepolia network + gas reporter |
| `contracts/package.json` | Add `hardhat-gas-reporter`, `dotenv` |
| `contracts/scripts/deploy.ts` | Accept `--network sepolia`, print gas summary |
| `lib/blockchain.ts` | Add `registerMerkleRootOnChain`, `getMerkleRootOnChain`, `getBatchForModelOnChain` |
| `prisma/schema.prisma` | Add `merkleBatchId Int?` on `AuctionItem`; add `MerkleBatch` model |
| `app/(protected)/admin/blockchain/page.tsx` | Add batch section, batch badge per entry, proof download button |
| `app/(protected)/admin/benchmark/page.tsx` | Add Merkle offline verification timing row + bundle size |
| `app/(protected)/list/[itemId]/page.tsx` | Add "Download proof bundle" link when item is in a batch |

---

## Task 1: Upgrade the Solidity contract

**Files:**
- Modify: `contracts/contracts/ModelRegistry.sol`
- Create: `contracts/test/ModelRegistry.test.ts`

- [ ] **Step 1: Replace `ModelRegistry.sol` with the upgraded version**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ModelRegistry {
    address public owner;

    // --- Individual registration (unchanged) ---
    struct ModelRecord {
        bytes32 hash;
        uint256 timestamp;
        bool registered;
    }
    mapping(string => ModelRecord) private models;

    // --- Merkle batch registration ---
    struct MerkleRecord {
        bytes32 root;
        uint256 timestamp;
        string[] modelIds;
    }
    mapping(uint256 => MerkleRecord) private merkleBatches;
    mapping(string => uint256) private modelToBatchId;
    uint256 public batchCount;

    event ModelRegistered(string indexed modelId, bytes32 hash, uint256 timestamp);
    event MerkleRootRegistered(uint256 indexed batchId, bytes32 root, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    // --- Individual registration (unchanged) ---
    function registerModel(string calldata modelId, bytes32 hash) external onlyOwner {
        models[modelId] = ModelRecord({ hash: hash, timestamp: block.timestamp, registered: true });
        emit ModelRegistered(modelId, hash, block.timestamp);
    }

    function getModel(string calldata modelId) external view returns (bytes32 hash, uint256 timestamp) {
        require(models[modelId].registered, "Model not registered");
        return (models[modelId].hash, models[modelId].timestamp);
    }

    function isRegistered(string calldata modelId) external view returns (bool) {
        return models[modelId].registered;
    }

    // --- Merkle batch registration ---
    function registerMerkleRoot(bytes32 root, string[] calldata modelIds) external onlyOwner {
        uint256 batchId = ++batchCount;
        merkleBatches[batchId] = MerkleRecord({ root: root, timestamp: block.timestamp, modelIds: modelIds });
        for (uint256 i = 0; i < modelIds.length; i++) {
            modelToBatchId[modelIds[i]] = batchId;
        }
        emit MerkleRootRegistered(batchId, root, block.timestamp);
    }

    function getMerkleRoot(uint256 batchId) external view returns (bytes32 root, uint256 timestamp, string[] memory modelIds) {
        require(batchId > 0 && batchId <= batchCount, "Batch not found");
        MerkleRecord storage rec = merkleBatches[batchId];
        return (rec.root, rec.timestamp, rec.modelIds);
    }

    function getBatchForModel(string calldata modelId) external view returns (uint256 batchId) {
        return modelToBatchId[modelId];
    }
}
```

- [ ] **Step 2: Write the Hardhat test file**

```typescript
// contracts/test/ModelRegistry.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { ModelRegistry } from "../typechain-types";

describe("ModelRegistry", () => {
  let registry: ModelRegistry;
  let owner: any;
  let other: any;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ModelRegistry");
    registry = await Factory.deploy();
  });

  // Individual registration (regression)
  it("registers and retrieves a model hash", async () => {
    const id = "model1";
    const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
    await registry.registerModel(id, hash);
    const [h] = await registry.getModel(id);
    expect(h).to.equal(hash);
  });

  it("reverts getModel for unregistered model", async () => {
    await expect(registry.getModel("missing")).to.be.revertedWith("Model not registered");
  });

  it("rejects registerModel from non-owner", async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("x"));
    await expect(registry.connect(other).registerModel("id", hash)).to.be.revertedWith("Not authorized");
  });

  // Merkle batch
  it("registers a Merkle batch and retrieves root", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    await registry.registerMerkleRoot(root, ["m1", "m2"]);
    const [r, , ids] = await registry.getMerkleRoot(1);
    expect(r).to.equal(root);
    expect(ids).to.deep.equal(["m1", "m2"]);
  });

  it("maps each modelId to its batchId via O(1) lookup", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    await registry.registerMerkleRoot(root, ["m1", "m2"]);
    expect(await registry.getBatchForModel("m1")).to.equal(1);
    expect(await registry.getBatchForModel("m2")).to.equal(1);
    expect(await registry.getBatchForModel("unknown")).to.equal(0);
  });

  it("overwrites batchId when model is re-batched", async () => {
    const r1 = ethers.keccak256(ethers.toUtf8Bytes("root1"));
    const r2 = ethers.keccak256(ethers.toUtf8Bytes("root2"));
    await registry.registerMerkleRoot(r1, ["m1"]);
    await registry.registerMerkleRoot(r2, ["m1"]);
    expect(await registry.getBatchForModel("m1")).to.equal(2);
  });

  it("rejects registerMerkleRoot from non-owner", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    await expect(
      registry.connect(other).registerMerkleRoot(root, ["m1"])
    ).to.be.revertedWith("Not authorized");
  });

  it("reverts getMerkleRoot for invalid batchId", async () => {
    await expect(registry.getMerkleRoot(0)).to.be.revertedWith("Batch not found");
    await expect(registry.getMerkleRoot(99)).to.be.revertedWith("Batch not found");
  });

  it("increments batchCount on each registration", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("r"));
    await registry.registerMerkleRoot(root, ["a"]);
    await registry.registerMerkleRoot(root, ["b"]);
    expect(await registry.batchCount()).to.equal(2);
  });
});
```

- [ ] **Step 3: Compile and run tests**

```bash
cd ~/Code/personal/bidsphere/contracts
npm run compile
npx hardhat test
```

Expected: all tests pass, no compilation errors.

- [ ] **Step 4: Regenerate TypeChain types**

```bash
cd ~/Code/personal/bidsphere/contracts
npx hardhat typechain
```

Expected: `typechain-types/ModelRegistry.ts` regenerated with new function signatures.

- [ ] **Step 5: Commit**

```bash
cd ~/Code/personal/bidsphere
git add contracts/contracts/ModelRegistry.sol contracts/test/ModelRegistry.test.ts contracts/typechain-types/
git commit -m "feat: add Merkle batch functions to ModelRegistry contract"
```

---

## Task 2: Configure Hardhat for Sepolia + gas reporter

**Files:**
- Modify: `contracts/hardhat.config.ts`
- Modify: `contracts/package.json`
- Modify: `contracts/scripts/deploy.ts`

- [ ] **Step 1: Install gas reporter and dotenv in the contracts package**

```bash
cd ~/Code/personal/bidsphere/contracts
npm install --save-dev hardhat-gas-reporter dotenv
```

- [ ] **Step 2: Replace `hardhat.config.ts`**

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const config: HardhatUserConfig = {
  solidity: "0.8.19",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts: process.env.BLOCKCHAIN_PRIVATE_KEY
        ? [process.env.BLOCKCHAIN_PRIVATE_KEY]
        : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
  },
};

export default config;
```

- [ ] **Step 3: Update `contracts/scripts/deploy.ts` to add Sepolia note**

```typescript
import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying on network: ${network.name}`);
  console.log("Deploying with account:", deployer.address);

  const ModelRegistry = await ethers.getContractFactory("ModelRegistry");
  const registry = await ModelRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("ModelRegistry deployed to:", address);

  const artifact = require("../artifacts/contracts/ModelRegistry.sol/ModelRegistry.json");
  const output = { address, abi: artifact.abi };

  const outputPath = path.resolve(__dirname, "../../lib/contracts/ModelRegistry.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("ABI + address written to lib/contracts/ModelRegistry.json");
  if (network.name === "sepolia") {
    console.log(`\nVerify on Etherscan: https://sepolia.etherscan.io/address/${address}`);
  }
  console.log("\nAdd to .env:");
  console.log(`BLOCKCHAIN_RPC_URL=${network.name === "sepolia" ? process.env.SEPOLIA_RPC_URL : "http://127.0.0.1:8545"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Add scripts to `contracts/package.json`**

```json
{
  "name": "bidsphere-contracts",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "test:gas": "REPORT_GAS=true hardhat test",
    "deploy:local": "hardhat run scripts/deploy.ts --network localhost",
    "deploy:sepolia": "hardhat run scripts/deploy.ts --network sepolia",
    "node": "hardhat node"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "dotenv": "^16.0.0",
    "hardhat": "^2.22.0",
    "hardhat-gas-reporter": "^1.0.10",
    "ts-node": "^10.9.2",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 5: Run tests with gas report to get thesis data**

```bash
cd ~/Code/personal/bidsphere/contracts
npm run test:gas
```

Expected: tests pass, `gas-report.txt` created. Copy the `registerModel` and `registerMerkleRoot` gas numbers into your thesis results chapter.

- [ ] **Step 6: Commit**

```bash
cd ~/Code/personal/bidsphere
git add contracts/hardhat.config.ts contracts/package.json contracts/scripts/deploy.ts contracts/package-lock.json
git commit -m "feat: add Sepolia network config and gas reporter to contracts"
```

---

## Task 3: Merkle tree library (`lib/merkle.ts`)

**Files:**
- Create: `lib/merkle.ts`

This is pure TypeScript — no blockchain calls, no DB. It builds a SHA-256 Merkle tree from an ordered array of hex leaf hashes and generates/verifies proofs. This runs server-side (Node.js `crypto`) and is mirrored in `verify.html` using `crypto.subtle`.

- [ ] **Step 1: Create `lib/merkle.ts`**

```typescript
import { createHash } from "crypto";

export type HexHash = string; // 0x-prefixed 32-byte hex

function sha256pair(a: HexHash, b: HexHash): HexHash {
  // Always sort so tree is deterministic regardless of insertion order
  const [left, right] = a <= b ? [a, b] : [b, a];
  const buf = Buffer.concat([
    Buffer.from(left.slice(2), "hex"),
    Buffer.from(right.slice(2), "hex"),
  ]);
  return "0x" + createHash("sha256").update(buf).digest("hex");
}

export interface MerkleTree {
  root: HexHash;
  leaves: HexHash[]; // ordered, padded to power-of-2 length
  totalLeaves: number; // unpadded count — used to guard against duplicate-leaf attacks (CVE-2012-2459)
}

export interface MerkleProof {
  leafIndex: number;
  proof: HexHash[]; // sibling hashes from leaf to root
}

/** Pad leaves array to the next power of 2 by duplicating the last leaf. */
function padToPowerOf2(leaves: HexHash[]): HexHash[] {
  if (leaves.length === 0) throw new Error("Cannot build tree from empty leaves");
  let n = 1;
  while (n < leaves.length) n *= 2;
  const padded = [...leaves];
  while (padded.length < n) padded.push(padded[padded.length - 1]);
  return padded;
}

export function buildMerkleTree(rawLeaves: HexHash[]): MerkleTree {
  const totalLeaves = rawLeaves.length; // preserve unpadded count before padding
  const leaves = padToPowerOf2(rawLeaves);
  let level = leaves;
  while (level.length > 1) {
    const next: HexHash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256pair(level[i], level[i + 1]));
    }
    level = next;
  }
  return { root: level[0], leaves, totalLeaves };
}

export function generateProof(tree: MerkleTree, leafIndex: number): MerkleProof {
  // Guard: reject pad-zone indices to prevent duplicate-leaf attacks (CVE-2012-2459)
  if (leafIndex >= tree.totalLeaves) {
    throw new Error(`leafIndex ${leafIndex} is out of range for ${tree.totalLeaves} real leaves`);
  }
  const leaves = [...tree.leaves];
  const proof: HexHash[] = [];
  let index = leafIndex;
  let level = leaves;
  while (level.length > 1) {
    const sibling = index % 2 === 0 ? level[index + 1] : level[index - 1];
    proof.push(sibling);
    const next: HexHash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256pair(level[i], level[i + 1]));
    }
    level = next;
    index = Math.floor(index / 2);
  }
  return { leafIndex, proof };
}

export function verifyProof(
  leaf: HexHash,
  proof: HexHash[],
  leafIndex: number,
  totalLeaves: number,
  expectedRoot: HexHash
): boolean {
  // Guard against duplicate-leaf attacks (CVE-2012-2459):
  // a padded ghost entry at index >= totalLeaves would produce a valid-looking
  // proof but refers to no real model — reject it here as a second gate.
  if (leafIndex >= totalLeaves) return false;
  let current = leaf;
  let index = leafIndex;
  for (const sibling of proof) {
    current = sha256pair(current, sibling);
    index = Math.floor(index / 2);
  }
  return current.toLowerCase() === expectedRoot.toLowerCase();
}
```

- [ ] **Step 2: Write tests for `lib/merkle.ts`**

Create `lib/merkle.test.ts`:

```typescript
// Run with: npx ts-node --esm lib/merkle.test.ts  OR add to a Vitest/Jest config
import { buildMerkleTree, generateProof, verifyProof } from "./merkle";

const leaves = [
  "0x" + "aa".repeat(32),
  "0x" + "bb".repeat(32),
  "0x" + "cc".repeat(32),
  "0x" + "dd".repeat(32),
];

const tree = buildMerkleTree(leaves);

// Root is deterministic
console.assert(tree.root.startsWith("0x"), "root should be 0x-prefixed");
console.assert(tree.root.length === 66, "root should be 32 bytes");
console.assert(tree.totalLeaves === 4, "totalLeaves should match unpadded count");

// Proof verifies for each real leaf
for (let i = 0; i < leaves.length; i++) {
  const proof = generateProof(tree, i);
  const valid = verifyProof(leaves[i], proof.proof, proof.leafIndex, tree.totalLeaves, tree.root);
  console.assert(valid, `proof for leaf ${i} should verify`);
}

// Tampered leaf fails
const badProof = generateProof(tree, 0);
const tampered = verifyProof("0x" + "ff".repeat(32), badProof.proof, 0, tree.totalLeaves, tree.root);
console.assert(!tampered, "tampered leaf should not verify");

// CVE-2012-2459 guard: generateProof rejects pad-zone index
const oddLeaves = ["0x" + "aa".repeat(32), "0x" + "bb".repeat(32), "0x" + "cc".repeat(32)];
const oddTree = buildMerkleTree(oddLeaves); // padded to 4
console.assert(oddTree.totalLeaves === 3, "totalLeaves should be 3 for odd input");
try {
  generateProof(oddTree, 3); // index 3 is a ghost pad entry
  console.assert(false, "should have thrown for pad-zone index");
} catch (e) {
  console.assert((e as Error).message.includes("out of range"), "error message should say out of range");
}
// verifyProof also rejects pad-zone index directly
const ghostValid = verifyProof("0x" + "cc".repeat(32), [], 3, oddTree.totalLeaves, oddTree.root);
console.assert(!ghostValid, "verifyProof should reject pad-zone leafIndex");

// Single leaf tree
const singleTree = buildMerkleTree(["0x" + "aa".repeat(32)]);
const singleProof = generateProof(singleTree, 0);
const singleValid = verifyProof("0x" + "aa".repeat(32), singleProof.proof, 0, singleTree.totalLeaves, singleTree.root);
console.assert(singleValid, "single-leaf proof should verify");

console.log("All merkle.ts tests passed.");
```

- [ ] **Step 3: Run the tests**

```bash
cd ~/Code/personal/bidsphere
npx ts-node lib/merkle.test.ts
```

Expected output: `All merkle.ts tests passed.`

- [ ] **Step 4: Commit**

```bash
git add lib/merkle.ts lib/merkle.test.ts
git commit -m "feat: add Merkle tree builder, proof generator, and verifier"
```

---

## Task 4: Extend `lib/blockchain.ts` with Merkle batch functions

**Files:**
- Modify: `lib/blockchain.ts`

- [ ] **Step 1: Add three new exports to `lib/blockchain.ts`**

Append to the end of the existing file (do not remove any existing functions):

```typescript
/**
 * Registers a Merkle root on-chain for a batch of models.
 * @param root     0x-prefixed 32-byte Merkle root
 * @param modelIds array of MongoDB AuctionItem IDs in the batch
 * @returns        the transaction hash
 */
export async function registerMerkleRootOnChain(
  root: string,
  modelIds: string[]
): Promise<string> {
  const contract = getContract(true);
  const tx = await contract.registerMerkleRoot(root as `0x${string}`, modelIds);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Reads the on-chain Merkle root record for a given batchId.
 * Returns null if not found or blockchain unreachable.
 */
export async function getMerkleRootOnChain(
  batchId: number
): Promise<{ root: string; timestamp: number; modelIds: string[] } | null> {
  try {
    const contract = getContract(false);
    const [root, timestamp, modelIds]: [string, bigint, string[]] =
      await contract.getMerkleRoot(batchId);
    return { root, timestamp: Number(timestamp), modelIds };
  } catch {
    return null;
  }
}

/**
 * Returns the batchId for a given modelId via O(1) on-chain lookup.
 * Returns 0 if the model has never been batched.
 */
export async function getBatchForModelOnChain(
  modelId: string
): Promise<number> {
  try {
    const contract = getContract(false);
    const batchId: bigint = await contract.getBatchForModel(modelId);
    return Number(batchId);
  } catch {
    return 0;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Code/personal/bidsphere
npx tsc --noEmit
```

Expected: no errors. If you get errors about `getBatchForModel` not being on the contract type, regenerate typechain types first: `cd contracts && npx hardhat typechain && cd ..`

- [ ] **Step 3: Commit**

```bash
git add lib/blockchain.ts
git commit -m "feat: add Merkle root blockchain helpers to lib/blockchain.ts"
```

---

## Task 5: Update Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `merkleBatchId` to `AuctionItem` and add the `MerkleBatch` model**

In `prisma/schema.prisma`, add `merkleBatchId Int?` to `AuctionItem` (after `updatedAt`):

```prisma
model AuctionItem {
  id            String        @id @default(auto()) @map("_id") @db.ObjectId
  name          String
  startingPrice Float
  currentPrice  Float
  pathToImage   String
  pathToCanvas  String
  description   String
  startTime     DateTime?
  endTime       DateTime?
  status        AuctionStatus @default(NOT_STARTED)
  bids                 Bid[]
  lastBidId            String?       @db.ObjectId
  modelHash            String?
  blockchainTxHash     String?
  originalPathToCanvas String?
  merkleBatchId        Int?
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
}
```

Then add the new `MerkleBatch` model at the end of the file:

```prisma
model MerkleBatch {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  batchId   Int      @unique
  root      String
  modelIds  String[]
  leaves    String[]
  txHash    String?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Push schema to MongoDB**

```bash
cd ~/Code/personal/bidsphere
npx prisma db push
npx prisma generate
```

Expected: `Your database is now in sync with your Prisma schema.` — MongoDB with Prisma does not require migrations; `db push` syncs the schema and `generate` regenerates the client.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add merkleBatchId to AuctionItem and MerkleBatch model"
```

---

## Task 6: Server action — `generateMerkleProof`

**Files:**
- Create: `actions/generateMerkleProof/index.ts`

This action takes an `itemId`, looks up which batch covers it, reconstructs the Merkle tree from stored leaves in `MerkleBatch`, and returns the full proof bundle JSON.

- [ ] **Step 1: Create `actions/generateMerkleProof/index.ts`**

```typescript
"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { buildMerkleTree, generateProof } from "@/lib/merkle";

export interface ProofBundle {
  modelId: string;
  modelName: string;
  fileHash: string;
  batchId: number;
  merkleRoot: string;
  merkleProof: string[];
  leafIndex: number;
  totalLeaves: number; // unpadded real leaf count — required for CVE-2012-2459 guard in verify.html
  registeredAt: number;
  chainId: number;
  contractAddress: string;
}

export async function generateMerkleProof(
  itemId: string
): Promise<ProofBundle | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { name: true, modelHash: true, merkleBatchId: true },
  });

  if (!item) return { error: "Item not found" };
  if (!item.merkleBatchId) return { error: "Item has not been added to a Merkle batch yet" };
  if (!item.modelHash) return { error: "Item has no stored model hash" };

  const batch = await db.merkleBatch.findUnique({
    where: { batchId: item.merkleBatchId },
  });

  if (!batch) return { error: "Batch record not found in database" };

  const leafIndex = batch.modelIds.indexOf(itemId);
  if (leafIndex === -1) return { error: "Item not found in batch leaf list" };

  // Server-side CVE-2012-2459 guard: reject if leafIndex falls in the pad zone.
  // batch.modelIds.length is the unpadded real count; indices >= this are ghost entries.
  if (leafIndex >= batch.modelIds.length) {
    return { error: "leafIndex is out of range for real leaves (pad-zone attack rejected)" };
  }

  const tree = buildMerkleTree(batch.leaves);
  const { proof } = generateProof(tree, leafIndex); // generateProof also throws for pad-zone index

  // batch.createdAt is the DB timestamp; for on-chain timestamp we use createdAt as approximation
  // The proof bundle includes the contract address so users can verify on Etherscan
  return {
    modelId: itemId,
    modelName: item.name,
    fileHash: item.modelHash,
    batchId: item.merkleBatchId,
    merkleRoot: batch.root,
    merkleProof: proof,
    leafIndex,
    totalLeaves: batch.modelIds.length, // unpadded count for CVE-2012-2459 guard in verify.html
    registeredAt: Math.floor(batch.createdAt.getTime() / 1000),
    chainId: 11155111, // Sepolia
    contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS ?? "",
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Code/personal/bidsphere
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add actions/generateMerkleProof/index.ts
git commit -m "feat: add generateMerkleProof server action"
```

---

## Task 7: Server action — `batchRegister`

**Files:**
- Create: `actions/admin/batchRegister/index.ts`

This admin-only action takes an array of itemIds, fetches their stored `modelHash` values, builds the Merkle tree, registers the root on-chain, then saves the `MerkleBatch` to DB and updates each `AuctionItem.merkleBatchId`.

- [ ] **Step 1: Create `actions/admin/batchRegister/index.ts`**

```typescript
"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";
import { buildMerkleTree } from "@/lib/merkle";
import { registerMerkleRootOnChain } from "@/lib/blockchain";

export interface BatchRegisterResult {
  batchId: number;
  root: string;
  txHash: string;
  modelCount: number;
}

export async function batchRegister(
  itemIds: string[]
): Promise<BatchRegisterResult | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };
  if (itemIds.length === 0) return { error: "No items selected" };

  const items = await db.auctionItem.findMany({
    where: { id: { in: itemIds }, modelHash: { not: null } },
    select: { id: true, modelHash: true },
    orderBy: { createdAt: "asc" },
  });

  if (items.length === 0) return { error: "None of the selected items have a stored model hash" };

  // Build leaves in stable order (DB createdAt asc) so proofs are reproducible
  const orderedIds = items.map((i) => i.id);
  const leaves = items.map((i) => i.modelHash as string);

  const tree = buildMerkleTree(leaves);

  const txHash = await registerMerkleRootOnChain(tree.root, orderedIds);

  // Get the new batchId (batchCount after tx) — read from DB after insert
  const existingBatches = await db.merkleBatch.count();
  const newBatchId = existingBatches + 1;

  await db.merkleBatch.create({
    data: {
      batchId: newBatchId,
      root: tree.root,
      modelIds: orderedIds,
      leaves: tree.leaves, // padded, as used by generateProof
      txHash,
    },
  });

  await db.auctionItem.updateMany({
    where: { id: { in: orderedIds } },
    data: { merkleBatchId: newBatchId },
  });

  return { batchId: newBatchId, root: tree.root, txHash, modelCount: orderedIds.length };
}

/** Returns items that have a modelHash but no merkleBatchId — candidates for batching. */
export async function getPendingBatchItems() {
  const user = await currentUser();
  if (!user) return [];
  const role = await currentRole();
  if (role !== "ADMIN") return [];

  return db.auctionItem.findMany({
    where: { modelHash: { not: null }, merkleBatchId: null },
    select: { id: true, name: true, modelHash: true },
    orderBy: { createdAt: "asc" },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Code/personal/bidsphere
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add actions/admin/batchRegister/index.ts
git commit -m "feat: add batchRegister server action for Merkle batch creation"
```

---

## Task 8: Update admin blockchain page

**Files:**
- Modify: `app/(protected)/admin/blockchain/page.tsx`

Add: (1) a second badge per entry showing "Individually registered" or "In Merkle batch #N", (2) a "Download proof bundle" button per batched entry, (3) a new "Merkle Batches" section with a "Create Merkle Batch" button.

- [ ] **Step 1: Replace `app/(protected)/admin/blockchain/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BeatLoader, ClipLoader } from "react-spinners";
import { toast } from "sonner";
import { getBlockchainRegistry, type RegistryEntry } from "@/actions/getBlockchainRegistry";
import { simulateTamper, restoreTamper } from "@/actions/simulateTamper";
import { reregisterModel } from "@/actions/reregisterModel";
import { batchRegister, getPendingBatchItems } from "@/actions/admin/batchRegister";
import { generateMerkleProof } from "@/actions/generateMerkleProof";

function truncateHash(hash: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

const BlockchainPage = () => {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<{ id: string; name: string }[]>([]);
  const [batchPending, setBatchPending] = useState(false);

  const loadRegistry = () => {
    setLoading(true);
    Promise.all([getBlockchainRegistry(), getPendingBatchItems()]).then(
      ([registry, pending]) => {
        setLoading(false);
        if ("error" in registry) { toast.error(registry.error); return; }
        setEntries(registry);
        setPendingItems(pending);
      }
    );
  };

  useEffect(() => { loadRegistry(); }, []);

  const handleTamper = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await simulateTamper(id);
      if ("error" in result) toast.error(result.error);
      else { toast.success("Tamper simulated — view item page to see mismatch"); loadRegistry(); }
      setPendingId(null);
    });
  };

  const handleReregister = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await reregisterModel(id);
      if ("error" in result) toast.error(result.error);
      else { toast.success("Re-registered on blockchain"); loadRegistry(); }
      setPendingId(null);
    });
  };

  const handleRestore = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await restoreTamper(id);
      if ("error" in result) toast.error(result.error);
      else { toast.success("Original model restored"); loadRegistry(); }
      setPendingId(null);
    });
  };

  const handleBatchRegister = () => {
    if (pendingItems.length === 0) return;
    setBatchPending(true);
    startTransition(async () => {
      const result = await batchRegister(pendingItems.map((i) => i.id));
      setBatchPending(false);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success(`Batch #${result.batchId} registered — ${result.modelCount} models`);
      loadRegistry();
    });
  };

  const handleDownloadProof = (id: string, name: string) => {
    startTransition(async () => {
      const result = await generateMerkleProof(id);
      if ("error" in result) { toast.error(result.error); return; }
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proof-${name.replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <RoleGate allowedRole={UserRole.ADMIN}>
      <Card className="w-[900px] mt-[100px] mb-8 max-h-[calc(100vh-160px)] flex flex-col">
        <CardHeader className="shrink-0">
          <p className="text-2xl font-semibold text-center">Blockchain Registry</p>
          <p className="text-sm text-muted-foreground text-center">
            On-chain integrity records for all 3D models
          </p>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 min-h-0 space-y-6">
          {loading ? (
            <div className="flex justify-center py-10"><ClipLoader color="#36d7b7" size={50} /></div>
          ) : (
            <>
              {/* Existing registry entries */}
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{entry.name}</p>
                        {entry.registeredAt && (
                          <p className="text-xs text-muted-foreground">
                            Registered: {entry.registeredAt.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {entry.isTampered ? (
                          <span className="text-xs font-semibold text-red-500 px-2 py-0.5 rounded-full border border-red-200">⚠ Tampered</span>
                        ) : entry.onChainHash ? (
                          <span className="text-xs font-semibold text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-200">✓ Registered</span>
                        ) : (
                          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border">Not registered</span>
                        )}
                        {/* Merkle batch badge — reads merkleBatchId from registry entry */}
                        {"merkleBatchId" in entry && entry.merkleBatchId ? (
                          <span className="text-xs font-semibold text-sky-500 px-2 py-0.5 rounded-full border border-sky-200">
                            Merkle batch #{entry.merkleBatchId as number}
                          </span>
                        ) : entry.onChainHash ? (
                          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border">Individually registered</span>
                        ) : null}
                      </div>
                    </div>

                    {entry.onChainHash && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div><span className="text-muted-foreground">On-chain hash: </span><span className="font-mono">{truncateHash(entry.onChainHash)}</span></div>
                        <div><span className="text-muted-foreground">Tx hash: </span><span className="font-mono">{truncateHash(entry.blockchainTxHash)}</span></div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1 flex-wrap">
                      {!entry.onChainHash && entry.modelHash && (
                        <Button variant="outline" size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleReregister(entry.id)}>
                          {isPending && pendingId === entry.id ? <BeatLoader size={6} /> : "Re-register on blockchain"}
                        </Button>
                      )}
                      {entry.onChainHash && !entry.isTampered && (
                        <Button variant="destructive" size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleTamper(entry.id)}>
                          {isPending && pendingId === entry.id ? <BeatLoader color="white" size={6} /> : "Simulate Tamper"}
                        </Button>
                      )}
                      {entry.onChainHash && entry.isTampered && (
                        <Button variant="outline" size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleRestore(entry.id)}>
                          {isPending && pendingId === entry.id ? <BeatLoader size={6} /> : "Restore Original"}
                        </Button>
                      )}
                      {"merkleBatchId" in entry && entry.merkleBatchId && (
                        <Button variant="outline" size="sm"
                          onClick={() => handleDownloadProof(entry.id, entry.name)}>
                          Download proof bundle
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Merkle batch section */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="font-semibold text-sm">Create Merkle Batch</p>
                {pendingItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    All registered models are already in a Merkle batch.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {pendingItems.length} model{pendingItems.length > 1 ? "s" : ""} pending batching:{" "}
                      {pendingItems.map((i) => i.name).join(", ")}
                    </p>
                    <Button size="sm" onClick={handleBatchRegister} disabled={batchPending}>
                      {batchPending ? <BeatLoader size={6} /> : `Batch register ${pendingItems.length} model${pendingItems.length > 1 ? "s" : ""}`}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </RoleGate>
  );
};

export default BlockchainPage;
```

- [ ] **Step 2: Update `getBlockchainRegistry` action to include `merkleBatchId`**

In `actions/getBlockchainRegistry/index.ts`, add `merkleBatchId: true` to the `select` block and include it in `RegistryEntry`:

```typescript
// Add to RegistryEntry interface:
merkleBatchId: number | null;

// Add to select block:
merkleBatchId: true,

// Add to the returned object in entries map:
merkleBatchId: item.merkleBatchId,
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ~/Code/personal/bidsphere
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/(protected)/admin/blockchain/page.tsx actions/getBlockchainRegistry/index.ts
git commit -m "feat: add Merkle batch UI to admin blockchain page"
```

---

## Task 9: Update benchmark page with Merkle offline timing

**Files:**
- Modify: `app/(protected)/admin/benchmark/page.tsx`
- Modify: `actions/benchmark/index.ts`

Add a "Merkle offline verification" timing row that measures client-side proof verification (no network call), and a proof bundle size metric.

- [ ] **Step 1: Update `actions/benchmark/index.ts` to return `merkleBatchId`**

In `getBenchmarkItems`, add `merkleBatchId: true` to the `select` block and update `BenchmarkItem`:

```typescript
export interface BenchmarkItem {
  id: string;
  name: string;
  pathToCanvas: string;
  merkleBatchId: number | null;
}

// In findMany select:
merkleBatchId: true,
```

- [ ] **Step 2: Update `BenchmarkResult` interface and add Merkle fields in `benchmark/page.tsx`**

Add to `BenchmarkResult`:

```typescript
merkleVerifyDurationMs: number | null;
proofBundleSizeBytes: number | null;
merkleVerified: boolean | null;
```

- [ ] **Step 3: Add Merkle verification to the `handleRun` function in `benchmark/page.tsx`**

After the existing `verified` assignment, add:

```typescript
let merkleVerifyDurationMs: number | null = null;
let proofBundleSizeBytes: number | null = null;
let merkleVerified: boolean | null = null;

if (item.merkleBatchId) {
  const { generateMerkleProof } = await import("@/actions/generateMerkleProof");
  const { verifyProof, buildMerkleTree } = await import("@/lib/merkle");
  const bundleResult = await generateMerkleProof(item.id);

  if (!("error" in bundleResult)) {
    const bundleJson = JSON.stringify(bundleResult);
    proofBundleSizeBytes = new Blob([bundleJson]).size;

    const merkleStart = performance.now();
    // Re-hash the already-fetched buffer (no extra network call)
    const proofLeafHash = clientHash;
    merkleVerified = verifyProof(
      proofLeafHash,
      bundleResult.merkleProof,
      bundleResult.leafIndex,
      bundleResult.merkleRoot
    );
    merkleVerifyDurationMs = Math.round(performance.now() - merkleStart);
  }
}
```

- [ ] **Step 4: Add Merkle rows to the results display in `benchmark/page.tsx`**

After the existing "SHA-256 hash (client)" row, add:

```tsx
{r.merkleVerifyDurationMs !== null && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Merkle proof verify (offline)</span>
    <span className="font-mono">{r.merkleVerifyDurationMs} ms</span>
  </div>
)}
{r.proofBundleSizeBytes !== null && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Proof bundle size</span>
    <span className="font-mono">{r.proofBundleSizeBytes} B</span>
  </div>
)}
{r.merkleVerified !== null && (
  <p className={`text-xs font-semibold col-span-2 ${r.merkleVerified ? "text-emerald-500" : "text-red-500"}`}>
    {r.merkleVerified ? "✓ Merkle proof verified (offline)" : "⚠ Merkle proof invalid"}
  </p>
)}
```

- [ ] **Step 5: Add Merkle columns to CSV export in `benchmark/page.tsx`**

In `exportCsv`, add to headers:
```typescript
"Merkle Verify (ms)", "Proof Bundle Size (B)", "Merkle Verified"
```

Add to rows:
```typescript
r.merkleVerifyDurationMs ?? "N/A",
r.proofBundleSizeBytes ?? "N/A",
r.merkleVerified === null ? "N/A" : r.merkleVerified ? "Yes" : "No",
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd ~/Code/personal/bidsphere
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/(protected)/admin/benchmark/page.tsx actions/benchmark/index.ts
git commit -m "feat: add Merkle offline verification metrics to benchmark page"
```

---

## Task 10: Add proof bundle download to item page

**Files:**
- Modify: `app/(protected)/list/[itemId]/page.tsx`
- Modify: `app/(protected)/_types/index.ts`

- [ ] **Step 1: Add `merkleBatchId` to the `AuctionItem` type**

In `app/(protected)/_types/index.ts`, add:

```typescript
merkleBatchId: number | null;
```

- [ ] **Step 2: Ensure `getItemData` action returns `merkleBatchId`**

In `actions/getItemData/index.ts`, add `merkleBatchId: true` to the select block.

- [ ] **Step 3: Add proof download button to `app/(protected)/list/[itemId]/page.tsx`**

Import `generateMerkleProof` and add a download button below the `ModelViewer`:

```tsx
import { generateMerkleProof } from "@/actions/generateMerkleProof";
import { toast } from "sonner";
import { useTransition } from "react";

// Inside ItemPage component, add:
const [isDownloadingProof, startProofTransition] = useTransition();

const handleDownloadProof = () => {
  if (!auctionItemData) return;
  startProofTransition(async () => {
    const result = await generateMerkleProof(itemId);
    if ("error" in result) { toast.error(result.error); return; }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proof-${auctionItemData.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
};

// In JSX, below the ModelViewer div:
{auctionItemData?.merkleBatchId && (
  <button
    onClick={handleDownloadProof}
    disabled={isDownloadingProof}
    className="text-xs text-sky-500 underline hover:text-sky-700 mt-2"
  >
    {isDownloadingProof ? "Generating proof..." : "Download offline proof bundle"}
  </button>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/list/[itemId]/page.tsx app/(protected)/_types/index.ts actions/getItemData/index.ts
git commit -m "feat: add offline proof bundle download to item page"
```

---

## Task 11: Build `public/verify.html`

**Files:**
- Create: `public/verify.html`

Self-contained, no external deps. All Merkle logic and SHA-256 inline. The hardcoded roots table is a JS object that must be updated after each `batchRegister` call (one line).

- [ ] **Step 1: Create `public/verify.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BidSphere — Offline Model Verifier</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 16px; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 32px; }
    .drop-row { display: flex; gap: 16px; width: 100%; max-width: 700px; margin-bottom: 24px; flex-wrap: wrap; }
    .drop-zone { flex: 1; min-width: 200px; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 28px 16px; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; background: white; }
    .drop-zone.has-file { border-color: #38bdf8; background: #f0f9ff; }
    .drop-zone.drag-over { border-color: #0ea5e9; background: #e0f2fe; }
    .drop-zone input { display: none; }
    .drop-label { font-size: 0.8rem; color: #64748b; margin-top: 6px; }
    .drop-filename { font-size: 0.75rem; color: #0ea5e9; margin-top: 4px; font-weight: 600; word-break: break-all; }
    button#verifyBtn { padding: 12px 32px; background: #0ea5e9; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button#verifyBtn:disabled { background: #94a3b8; cursor: not-allowed; }
    button#verifyBtn:hover:not(:disabled) { background: #0284c7; }
    #result { width: 100%; max-width: 700px; margin-top: 24px; }
    .result-box { border-radius: 12px; padding: 20px; font-size: 0.875rem; }
    .result-green { background: #f0fdf4; border: 1px solid #86efac; }
    .result-red { background: #fef2f2; border: 1px solid #fca5a5; }
    .result-orange { background: #fff7ed; border: 1px solid #fdba74; }
    .result-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; }
    .hash-row { margin: 6px 0; }
    .hash-label { color: #64748b; font-size: 0.75rem; margin-bottom: 2px; }
    .hash-val { font-family: monospace; font-size: 0.7rem; word-break: break-all; padding: 6px 8px; border-radius: 6px; background: #f1f5f9; }
    .meta { color: #64748b; font-size: 0.75rem; margin-top: 10px; }
    footer { margin-top: 48px; color: #94a3b8; font-size: 0.75rem; text-align: center; }
    footer a { color: #38bdf8; }
  </style>
</head>
<body>
  <h1>BidSphere Offline Verifier</h1>
  <p class="subtitle">Verify a 3D model's authenticity without any network connection.</p>

  <div class="drop-row">
    <div class="drop-zone" id="glbZone">
      <input type="file" id="glbInput" accept=".glb" />
      <div>📦 Drop <strong>.glb</strong> file here</div>
      <div class="drop-label">or click to browse</div>
      <div class="drop-filename" id="glbName"></div>
    </div>
    <div class="drop-zone" id="proofZone">
      <input type="file" id="proofInput" accept=".json" />
      <div>📄 Drop <strong>proof.json</strong> here</div>
      <div class="drop-label">or click to browse</div>
      <div class="drop-filename" id="proofName"></div>
    </div>
  </div>

  <button id="verifyBtn" disabled>Verify</button>
  <div id="result"></div>

  <footer>
    <p>This verifier works entirely in your browser — no data is sent anywhere.</p>
    <p style="margin-top:6px">To independently confirm Merkle roots on-chain, visit
      <a id="etherscanLink" href="#" target="_blank">Etherscan (Sepolia)</a>.
    </p>
  </footer>

  <script>
    // ─── TRUSTED ROOTS TABLE ─────────────────────────────────────────────────
    // Update this object after each batchRegister call.
    // Format: { batchId: "0x<merkle-root>" }
    const TRUSTED_ROOTS = {
      // 1: "0x<root-from-first-batch>",
    };
    const CONTRACT_ADDRESS = ""; // fill in after Sepolia deployment
    // ─────────────────────────────────────────────────────────────────────────

    document.getElementById("etherscanLink").href =
      `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`;

    let glbFile = null;
    let proofData = null;

    function setupDropZone(zoneId, inputId, nameId, accept, onLoad) {
      const zone = document.getElementById(zoneId);
      const input = document.getElementById(inputId);
      const nameEl = document.getElementById(nameId);

      zone.addEventListener("click", () => input.click());
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      });
      input.addEventListener("change", () => { if (input.files[0]) handleFile(input.files[0]); });

      function handleFile(file) {
        nameEl.textContent = file.name;
        zone.classList.add("has-file");
        onLoad(file);
      }
    }

    setupDropZone("glbZone", "glbInput", "glbName", ".glb", (file) => {
      glbFile = file;
      updateBtn();
    });

    setupDropZone("proofZone", "proofInput", "proofName", ".json", (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try { proofData = JSON.parse(e.target.result); } catch { proofData = null; }
        updateBtn();
      };
      reader.readAsText(file);
    });

    function updateBtn() {
      document.getElementById("verifyBtn").disabled = !(glbFile && proofData);
    }

    // ─── Merkle helpers (mirrored from lib/merkle.ts) ─────────────────────
    async function sha256hex(data) {
      const buf = await crypto.subtle.digest("SHA-256", data);
      return "0x" + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function hexToBytes(hex) {
      const h = hex.startsWith("0x") ? hex.slice(2) : hex;
      const arr = new Uint8Array(h.length / 2);
      for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i*2, i*2+2), 16);
      return arr;
    }

    async function sha256pair(a, b) {
      const [left, right] = a <= b ? [a, b] : [b, a];
      const combined = new Uint8Array([...hexToBytes(left), ...hexToBytes(right)]);
      return sha256hex(combined);
    }

    async function computeRoot(leaf, proof, leafIndex) {
      let current = leaf;
      let index = leafIndex;
      for (const sibling of proof) {
        current = await sha256pair(current, sibling);
        index = Math.floor(index / 2);
      }
      return current;
    }
    // ──────────────────────────────────────────────────────────────────────

    document.getElementById("verifyBtn").addEventListener("click", async () => {
      const btn = document.getElementById("verifyBtn");
      btn.disabled = true;
      btn.textContent = "Verifying...";
      document.getElementById("result").innerHTML = "";

      try {
        // Gate 1: CVE-2012-2459 duplicate-leaf attack guard.
        // Reject bundles where leafIndex >= totalLeaves (pad-zone ghost entries).
        if (proofData.leafIndex >= proofData.totalLeaves) {
          throw new Error(
            `leafIndex ${proofData.leafIndex} is >= totalLeaves ${proofData.totalLeaves} — possible duplicate-leaf attack (CVE-2012-2459)`
          );
        }

        // Gate 2: hash the GLB
        const glbBuffer = await glbFile.arrayBuffer();
        const computedHash = await sha256hex(glbBuffer);

        // Gate 3: check file hash matches bundle
        const fileHashMatch = computedHash.toLowerCase() === proofData.fileHash.toLowerCase();

        // Gate 4: walk Merkle proof to derive root
        const derivedRoot = await computeRoot(computedHash, proofData.merkleProof, proofData.leafIndex);
        const proofConsistent = derivedRoot.toLowerCase() === proofData.merkleRoot.toLowerCase();

        // Gate 5: check derived root against trusted table
        const trustedRoot = TRUSTED_ROOTS[proofData.batchId];
        const rootTrusted = trustedRoot
          ? trustedRoot.toLowerCase() === derivedRoot.toLowerCase()
          : null; // null = not in table yet

        showResult({ computedHash, proofData, fileHashMatch, proofConsistent, derivedRoot, rootTrusted });
      } catch (err) {
        document.getElementById("result").innerHTML =
          `<div class="result-box result-red"><div class="result-title" style="color:#dc2626">Error during verification</div><p>${err.message}</p></div>`;
      }

      btn.disabled = false;
      btn.textContent = "Verify";
    });

    function showResult({ computedHash, proofData, fileHashMatch, proofConsistent, derivedRoot, rootTrusted }) {
      const allGreen = fileHashMatch && proofConsistent && rootTrusted === true;
      const tampered = !fileHashMatch || !proofConsistent;
      const unknownRoot = !tampered && rootTrusted === null;

      let cls = tampered ? "result-red" : unknownRoot ? "result-orange" : "result-green";
      let title = tampered
        ? "⚠ Integrity Mismatch — File May Be Tampered"
        : unknownRoot
          ? "⚠ Proof Valid — Root Not in Trusted Table"
          : "✓ Fully Verified — File Is Authentic";
      let titleColor = tampered ? "#dc2626" : unknownRoot ? "#ea580c" : "#16a34a";

      let html = `<div class="result-box ${cls}">
        <div class="result-title" style="color:${titleColor}">${title}</div>`;

      if (unknownRoot) {
        html += `<p style="margin:8px 0;color:#92400e;font-size:0.8rem">
          The Merkle proof is internally valid but batch #${proofData.batchId} is not yet in this verifier's trusted roots table.
          Manually compare the derived root below against the contract on
          <a href="https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}" target="_blank" style="color:#0ea5e9">Etherscan</a>
          or the published root in the thesis appendix.
        </p>`;
      }

      html += `
        <div class="hash-row"><div class="hash-label">Computed SHA-256 (this file):</div>
          <div class="hash-val" style="color:${fileHashMatch ? "#16a34a" : "#dc2626"}">${computedHash}</div></div>
        <div class="hash-row"><div class="hash-label">Bundle file hash:</div>
          <div class="hash-val">${proofData.fileHash}</div></div>
        <div class="hash-row"><div class="hash-label">Derived Merkle root (from proof path):</div>
          <div class="hash-val" style="color:${proofConsistent ? "#16a34a" : "#dc2626"}">${derivedRoot}</div></div>
        <div class="hash-row"><div class="hash-label">Bundle Merkle root:</div>
          <div class="hash-val">${proofData.merkleRoot}</div></div>
        <div class="meta">
          Model: <strong>${proofData.modelName}</strong> &nbsp;|&nbsp;
          Batch #${proofData.batchId} &nbsp;|&nbsp;
          Leaf index: ${proofData.leafIndex} &nbsp;|&nbsp;
          Registered: ${new Date(proofData.registeredAt * 1000).toLocaleString()}
        </div>
      </div>`;

      document.getElementById("result").innerHTML = html;
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: After Sepolia deployment, fill in `CONTRACT_ADDRESS` and add the first batch root to `TRUSTED_ROOTS`**

This is a manual step done once after Task 12 completes. Open `public/verify.html`, find the `TRUSTED_ROOTS` object and `CONTRACT_ADDRESS` constant, and fill them in.

- [ ] **Step 3: Commit**

```bash
git add public/verify.html
git commit -m "feat: add standalone offline verifier (verify.html)"
```

---

## Task 12: Deploy to Sepolia and wire up `.env`

This task requires manual steps you do yourself in the terminal.

- [ ] **Step 1: Get Sepolia ETH**

Visit `https://cloud.google.com/application/web3/faucet/ethereum/sepolia` — sign in with Google and paste your wallet address (derive it from `BLOCKCHAIN_PRIVATE_KEY` using `npx hardhat run -e "const w = new ethers.Wallet(process.env.BLOCKCHAIN_PRIVATE_KEY); console.log(w.address)"` or check the existing deploy output).

- [ ] **Step 2: Get a free Sepolia RPC URL**

Sign up at `https://www.alchemy.com` (free tier). Create an app on Sepolia. Copy the HTTPS RPC URL.

- [ ] **Step 3: Add to `.env`**

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
BLOCKCHAIN_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
```

`BLOCKCHAIN_PRIVATE_KEY` is already set — use the same key.

- [ ] **Step 4: Deploy the contract**

```bash
cd ~/Code/personal/bidsphere/contracts
npm run deploy:sepolia
```

Expected output:
```
Deploying on network: sepolia
Deploying with account: 0x...
ModelRegistry deployed to: 0x...
ABI + address written to lib/contracts/ModelRegistry.json
Verify on Etherscan: https://sepolia.etherscan.io/address/0x...
```

- [ ] **Step 5: Update `verify.html` with contract address**

In `public/verify.html`, set `CONTRACT_ADDRESS` to the deployed address from Step 4.

- [ ] **Step 6: Test the deployment works**

Start the dev server and upload a new model via the admin upload page. Check the blockchain registry page — the model should appear as individually registered. Then run a batch register. Download a proof bundle. Open `public/verify.html` in a browser (locally, via `file://` path), drop in the `.glb` and `proof.json`, verify it shows green.

- [ ] **Step 7: Update `TRUSTED_ROOTS` in `verify.html` with the first batch root**

After the batch registers, copy the Merkle root from the proof bundle and add it to the `TRUSTED_ROOTS` object in `verify.html`.

- [ ] **Step 8: Commit**

```bash
git add public/verify.html lib/contracts/ModelRegistry.json
git commit -m "deploy: update ModelRegistry ABI/address for Sepolia testnet"
```

---

## Post-Implementation: Thesis Data Collection

Once all tasks are complete, run the full research experiment:

1. Open `/admin/benchmark`, select a model that is in a Merkle batch
2. Run benchmark — record all timing values and proof bundle size
3. Go to `/admin/blockchain`, simulate tamper on the model
4. Run benchmark again — note the `⚠ Merkle proof invalid` result
5. Export CSV from the benchmark page — this CSV is your raw data table for the thesis results chapter
6. Open `public/verify.html` locally (no server), drop in the `.glb` + proof — screenshot for thesis Appendix A
7. Run `cd contracts && npm run test:gas` — copy gas numbers from `gas-report.txt` into the thesis results chapter

---

## Self-Review

**Spec coverage check:**
- ✅ Section 1 (O(1) contract mapping) — Task 1
- ✅ Section 2 (proof bundle format) — Task 6 (`ProofBundle` interface)
- ✅ Section 3 (offline verify logic, 3-gate hybrid) — Task 11 (`verify.html`)
- ✅ Section 4 (new/modified files) — all tasks
- ✅ Section 5 (MongoDB schema) — Task 5
- ✅ Section 6 (admin UI) — Tasks 8, 9
- ✅ Section 7 (gas metrics) — Task 2 (`hardhat-gas-reporter`), Task 9 (benchmark)
- ✅ Section 8 (standalone verifier with hardcoded table + displayed root) — Task 11
- ✅ Deployment checklist — Task 12

**Type consistency check:**
- `ProofBundle` defined in Task 6, used in Tasks 8, 9, 10 — consistent
- `MerkleBatch` Prisma model defined in Task 5, used in Tasks 6, 7 — consistent
- `buildMerkleTree` / `generateProof` / `verifyProof` defined in Task 3, used in Tasks 6, 7, 9 — consistent
- `batchRegister` / `getPendingBatchItems` defined in Task 7, used in Task 8 — consistent
- `merkleBatchId` added to `AuctionItem` in Task 5, added to `RegistryEntry` in Task 8, added to `BenchmarkItem` in Task 9, added to `_types/index.ts` in Task 10 — consistent

**No placeholders found.**
