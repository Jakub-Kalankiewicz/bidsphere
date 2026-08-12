import { createHash } from "crypto";

export const SEPOLIA_CHAIN_ID = 11_155_111n;
export const SEPOLIA_SMOKE_GAS_LIMITS = Object.freeze({
  deployment: 1_000_000n,
  modelRegistration: 250_000n,
  merkleRegistration: 500_000n,
});

type Environment = Record<string, string | undefined>;

export interface SepoliaFixture {
  bytes: Buffer;
  modelId: string;
  decoyModelId: string;
  fileHash: string;
  merkleRoot: string;
  merkleProof: string[];
  leafIndex: number;
  totalLeaves: number;
}

export function assertSepoliaPreflightInputs(
  networkName: string,
  chainId: bigint,
  environment: Environment
): void {
  if (!environment.SEPOLIA_RPC_URL?.trim()) {
    throw new Error("SEPOLIA_RPC_URL is required for the Sepolia preflight");
  }
  if (!environment.BLOCKCHAIN_PRIVATE_KEY?.trim()) {
    throw new Error("BLOCKCHAIN_PRIVATE_KEY is required for the Sepolia preflight");
  }
  if (networkName !== "sepolia" || chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error("The smoke test must run on the Sepolia network");
  }
}

export function estimateSmokeMinimumBalance(maxFeePerGas: bigint): bigint {
  if (maxFeePerGas <= 0n) {
    throw new Error("A positive fee estimate is required");
  }
  const totalGasLimit = Object.values(SEPOLIA_SMOKE_GAS_LIMITS).reduce(
    (sum, value) => sum + value,
    0n
  );
  return maxFeePerGas * totalGasLimit;
}

export function assertGasEstimateWithinLimit(
  estimate: bigint,
  limit: bigint,
  label: string
): void {
  if (estimate <= 0n || estimate > limit) {
    throw new Error(
      `${label} gas estimate ${estimate} exceeds the configured gas ceiling ${limit}`
    );
  }
}

function sha256(bytes: Uint8Array): string {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

function sha256Pair(left: string, right: string): string {
  const [first, second] = [left.toLowerCase(), right.toLowerCase()].sort();
  return sha256(Buffer.concat([
    Buffer.from(first.slice(2), "hex"),
    Buffer.from(second.slice(2), "hex"),
  ]));
}

function buildMinimalGlb(): Buffer {
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0", generator: "BidSphere Sepolia smoke v1" },
      scene: 0,
      scenes: [{}],
    }),
    "utf8"
  );
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const paddedJson = Buffer.alloc(paddedLength, 0x20);
  json.copy(paddedJson);

  const glb = Buffer.alloc(12 + 8 + paddedLength);
  glb.write("glTF", 0, "ascii");
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(paddedLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(glb, 20);
  return glb;
}

export function buildSepoliaFixture(): SepoliaFixture {
  const bytes = buildMinimalGlb();
  const fileHash = sha256(bytes);
  const decoyHash = sha256(Buffer.from("BidSphere Sepolia smoke decoy v1", "utf8"));

  return {
    bytes,
    modelId: "bidsphere-sepolia-smoke-model-v1",
    decoyModelId: "bidsphere-sepolia-smoke-decoy-v1",
    fileHash,
    merkleRoot: sha256Pair(fileHash, decoyHash),
    merkleProof: [decoyHash],
    leafIndex: 0,
    totalLeaves: 2,
  };
}
