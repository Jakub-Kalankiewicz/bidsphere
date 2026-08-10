# Merkle Proof Offline Verification — Design Spec

> **Historical design record.** This file documents assumptions used before
> the August 2026 thesis audit. Current code and thesis artifacts supersede its
> claims about framework versions, gas savings, authenticity, trust anchors and
> direct equivalence with CVE-2012-2459.

**Date:** 2026-06-07  
**Branch:** `feature/merkle-proof-verification`  
**Thesis title (WIP):** "Data security mechanisms for browser rendering"

---

## Context

BidSphere is a 3D model auction platform with an existing blockchain integrity layer: on upload, the SHA-256 hash of a GLB file is registered in a Solidity `ModelRegistry` contract. Each item page shows a `VerificationBadge` that recomputes the hash client-side and compares it to the on-chain record.

The professor's feedback asked: *why is this better than SSL, and can verification work offline?*

This spec describes the Merkle proof extension that answers both questions with working code.

---

## Goals

1. **True offline verification** — a user can verify a `.glb` file without any network call, using only the file and a proof bundle obtained earlier.
2. **Standalone verifier** — a single `verify.html` shipped in `/public` that works locally in any browser with no server.
3. **Research experiment** — 4 measurable scenarios for the thesis experiment chapter.
4. **Backwards compatibility** — every existing feature (individual registration, VerificationBadge, benchmark, tamper simulation) continues to work unchanged.

---

## What Does NOT Change

- MongoDB schema (except one nullable field addition)
- Cloudinary — models still stored and served there
- Proxy API `/api/model/[itemId]`
- Auction, bidding, auth flows
- Existing `VerificationBadge` (extended, not replaced)
- Existing `registerModel` / `getModel` / `isRegistered` contract functions

---

## Section 1: Smart Contract Changes

**File:** `contracts/contracts/ModelRegistry.sol`

Add alongside existing `models` mapping:

```solidity
struct MerkleRecord {
    bytes32 root;
    uint256 timestamp;
    string[] modelIds;
}
mapping(uint256 => MerkleRecord) private merkleBatches;
mapping(string => uint256) private modelToBatchId;  // O(1) model → batch lookup
uint256 public batchCount;
```

The `modelToBatchId` mapping is updated inside `registerMerkleRoot` for every modelId in the batch — a single loop within one transaction. If a model is ever re-batched, the mapping naturally overwrites with the latest batchId, which is the correct behavior for proof generation. This replaces the previous O(N) linear scan design and avoids any risk of hitting the block gas limit as the number of batches grows.

**New functions:**

- `registerMerkleRoot(bytes32 root, string[] calldata modelIds)` — admin only, stores root + covered model IDs, updates `modelToBatchId[modelId]` for each entry, emits `MerkleRootRegistered(batchId, root, timestamp)`
- `getMerkleRoot(uint256 batchId)` — public view, returns `(root, timestamp, modelIds)`
- `getBatchForModel(string calldata modelId)` — O(1) view, returns `batchId` via direct mapping lookup

**Proof verification is NOT in Solidity** — gas cost is unnecessary. The root being on-chain is the trust anchor; proof walking happens in the browser for free.

**Deployment:** Deploy new contract to Sepolia testnet (free, test ETH from Google/Alchemy faucet). Update `lib/contracts/ModelRegistry.json` with new address + ABI. Existing local-chain data is not migrated — Sepolia starts fresh.

---

## Section 2: Proof Bundle Format

A small JSON file downloaded alongside the model:

```json
{
  "modelId": "64abc...",
  "modelName": "Titanium Bracket v2",
  "fileHash": "0x3f2a...",
  "batchId": 1,
  "merkleRoot": "0x9d1c...",
  "merkleProof": ["0xaa1b...", "0xf3c2...", "0x112d..."],
  "leafIndex": 3,
  "totalLeaves": 5,
  "registeredAt": 1718000000,
  "chainId": 11155111,
  "contractAddress": "0xAbCd..."
}
```

`merkleProof` is the sibling hash path from leaf to root. For 1000 models: max 10 values (~500 bytes). For the thesis scale (tens of models): 3–5 values.

`totalLeaves` is the unpadded real leaf count. It is used by both `verify.html` and `verifyProof` in `lib/merkle.ts` to reject bundles where `leafIndex >= totalLeaves` — the primary mitigation for CVE-2012-2459 (duplicate-leaf attack), where a padded ghost entry at an index beyond the real model count would otherwise produce a valid-looking proof.

---

## Section 3: Offline Verification Logic

The verify flow (runs entirely in browser, zero network):

1. Check `bundle.leafIndex < bundle.totalLeaves` — CVE-2012-2459 guard: reject pad-zone ghost entries before any crypto work
2. Hash the `.glb` using `crypto.subtle.digest("SHA-256")`
3. Check `computedHash === bundle.fileHash` — file integrity gate
4. Walk the Merkle proof: iteratively hash leaf with siblings up to root, deriving `computedRoot`
5. Check `computedRoot === bundle.merkleRoot` — internal proof consistency gate
6. Check `bundle.merkleRoot` exists in the hardcoded roots table in `verify.html` — automated trust anchor gate

All six checks must pass for a green result. The same `leafIndex < totalLeaves` guard is also enforced server-side in `generateMerkleProof` and in `verifyProof` in `lib/merkle.ts`, giving three independent enforcement points for the same constraint. Steps 1–4 prove the file is internally consistent with the bundle. Step 5 is what establishes trust: without it, a sophisticated attacker could forge an entirely self-consistent fake bundle. The hardcoded roots table is what closes that attack vector automatically.

**The derived root is always displayed prominently in the UI** regardless of whether it matches the table. This serves the "Paper/External Trust Anchor" use case: even on a machine where `verify.html` is outdated and the root is not yet in the table, the user can manually compare the displayed root against:

- **Option 2:** The root printed in the thesis appendix / published on the official GitHub README
- **Option 3:** The contract's state on `sepolia.etherscan.io/address/<contract>` (one Etherscan visit, then cached)

This hybrid design gives three layers: automated check (hardcoded table), user-assisted check (displayed root for manual comparison), and public audit trail (Etherscan). All three trust anchor options are mentioned in the thesis with the hybrid as the primary implementation.

---

## Section 4: New Files & Modified Files

### New files

| Path | Purpose |
|---|---|
| `actions/generateMerkleProof/index.ts` | Server action: builds proof JSON for a given itemId |
| `actions/admin/batchRegister/index.ts` | Server action: builds Merkle tree, registers root on-chain, updates DB |
| `public/verify.html` | Standalone offline verifier — self-contained, inline JS, no external deps |

### Modified files

| Path | Change |
|---|---|
| `contracts/contracts/ModelRegistry.sol` | Add Merkle batch functions |
| `contracts/scripts/deploy.ts` | Add Sepolia network target |
| `contracts/hardhat.config.ts` | Add Sepolia network config |
| `lib/blockchain.ts` | Add `buildMerkleTree`, `generateProof`, `registerMerkleRootOnChain` |
| `prisma/schema.prisma` | Add `merkleBatchId Int?` on `AuctionItem`; add `MerkleBatch` model |
| `app/(protected)/admin/blockchain/page.tsx` | Add batch section + proof download button per entry |
| `app/(protected)/admin/benchmark/page.tsx` | Add Merkle offline verification timing row + proof bundle size metric |
| `app/(protected)/list/[itemId]/page.tsx` | Add "Download proof bundle" link |

---

## Section 5: MongoDB Schema Changes

```prisma
model AuctionItem {
  // ... existing fields ...
  merkleBatchId Int?   // null = individually registered or not yet batched
}

model MerkleBatch {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  batchId   Int      @unique
  root      String
  modelIds  String[]
  leaves    String[] // ordered leaf hashes — needed to reconstruct proofs
  txHash    String?
  createdAt DateTime @default(now())
}
```

`merkleBatchId` is nullable — no migration needed for existing documents. `MerkleBatch.leaves` stores the ordered leaf array so the server can reconstruct any proof without re-fetching models.

---

## Section 6: Admin UI Changes

**Blockchain page additions:**

- Each registry entry gets a second badge: "Individually registered" or "In Merkle batch #N"
- Each entry with a batch gets a "Download proof bundle" button
- New section at bottom: "Merkle Batches" — lists existing batches with root, timestamp, model count
- "Create Merkle Batch" button: shows items pending batching (have `modelHash`, no `merkleBatchId`), builds tree, registers on-chain, updates DB

**Benchmark page additions:**

- New "Merkle offline verification" row: time to verify proof bundle client-side (no blockchain RPC)
- New "Proof bundle size" metric (bytes)
- CSV export picks up new columns automatically

---

## Section 7: Research Experiment

Four scenarios using existing `simulateTamper` / `restoreTamper` infrastructure:

| # | Scenario | Network required | Tamper detected? | Verification overhead (ms) | Gas cost per model | Proof bundle size |
|---|---|---|---|---|---|---|
| 1 | No integrity check | None | Never | 0 ms | 0 | — |
| 2 | SSL only | Yes | No — SSL protects transit only | ~TLS handshake only | 0 | — |
| 3 | Individual blockchain | Yes (RPC) | Yes | ~300–500 ms (RPC latency) | ~65,000–80,000 gas | — |
| 4 | Merkle proof offline (new) | None | Yes | ~2–5 ms (CPU only) | ~1,000–3,000 gas per model in batch | ~500 bytes |

**Gas cost explanation for thesis results chapter:**

Scenario 3 (individual registration) calls `registerModel` once per model. Each call costs approximately 65,000–80,000 gas (base transaction ~21,000 + one `SSTORE` for the struct + event). At 10 models: ~700,000 gas total.

Scenario 4 (Merkle batch) calls `registerMerkleRoot` once for N models. The root is a single `bytes32` SSTORE (~20,000 gas). The `modelIds` array adds ~20,000 gas base + ~680 gas per entry (calldata). The `modelToBatchId` mapping adds ~20,000 gas per model (SSTORE). Estimated total for 10 models: ~250,000–280,000 gas — roughly **3.5× cheaper per model** than individual registration. At 100 models the savings compound further since fixed batch overhead is amortized.

**Important:** Run `hardhat-gas-reporter` during implementation to record exact figures for your thesis. Add `hardhat-gas-reporter` to `contracts/package.json` and set `REPORT_GAS=true` in the test environment. The numbers above are estimates based on EVM opcode costs — your actual measurements go in the results chapter, not these estimates.

**Thesis claim:** Scenarios 1–2 establish the gap SSL cannot close. Scenarios 3–4 demonstrate the contribution. Scenario 4 vs 3 shows: (a) offline capability — no RPC required, (b) speed — 100× faster verification (2 ms vs 400 ms), (c) economic efficiency — 3.5× lower gas cost per model at scale.

---

## Section 8: Standalone `verify.html`

Self-contained file at `/public/verify.html`:

- Two drag-drop zones: `.glb` and `proof.json`
- Inline JS: SHA-256 via `crypto.subtle`, Merkle path walker — no external scripts, no CDN
- Hardcoded roots table updated each time a new batch is registered (one-line update in the JS object)
- The derived Merkle root is always displayed prominently in the UI — even when the automated check passes — so the user can optionally cross-check it against an external source
- Three result states:
  - **Green** — file hash matches bundle, proof walks correctly to root, root found in hardcoded table
  - **Orange** — file hash and proof are internally valid, but root not in table (user should cross-check root manually against thesis appendix or Etherscan)
  - **Red** — file hash mismatch or proof path broken (file has been tampered)
- Footer note: "To independently confirm roots: `sepolia.etherscan.io/address/<contract>`"

**Why the hardcoded table is kept:** Steps 1–4 of the verify flow (Section 3) prove internal consistency of file + bundle, but do not prove the bundle itself is trustworthy. Without the table, a malicious actor could forge a self-consistent fake bundle and get a green result. The table is the automated trust anchor that closes this gap. Displaying the derived root adds the manual cross-check path on top of — not instead of — the automated check.

This file is referenced in the thesis as "Appendix A: Standalone Verifier" and can be handed to the professor on a USB stick with no internet connection required.

---

## Deployment Checklist (one-time, before first Merkle batch)

- [ ] Add Sepolia network to `hardhat.config.ts`
- [ ] Add `SEPOLIA_RPC_URL` and confirm `BLOCKCHAIN_PRIVATE_KEY` in `.env`
- [ ] Fund wallet address with Sepolia ETH (Google faucet or Alchemy faucet)
- [ ] Deploy new contract: `cd contracts && npx hardhat run scripts/deploy.ts --network sepolia`
- [ ] Copy deployed address + ABI to `lib/contracts/ModelRegistry.json`
- [ ] Update `BLOCKCHAIN_RPC_URL` in `.env` to Sepolia RPC endpoint

---

## Rollback Plan

- All changes are on `feature/merkle-proof-verification` branch
- `git checkout main` restores the original app completely
- The new `merkleBatchId` field is nullable — no data loss if branch is abandoned
- The new `MerkleBatch` collection can be dropped with no side effects
- The old contract on localhost remains unaffected
