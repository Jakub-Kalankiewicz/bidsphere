import { createHash } from "node:crypto";

export const SEPOLIA_BENCHMARK_CONFIG = Object.freeze({
  batchSize: 10,
  warmupRounds: 1,
  recordedRounds: 5,
  receiptConfirmations: 1,
  receiptTimeoutMs: 600_000,
});

export const SEPOLIA_BENCHMARK_GAS_LIMITS = Object.freeze({
  deployment: 1_500_000n,
  individualRegistration: 150_000n,
  merkleRegistration: 750_000n,
});

export type BenchmarkStrategy = "individual" | "merkle";
export type BenchmarkOperationKind =
  | "deployment"
  | "individual-registration"
  | "merkle-registration";

export interface BenchmarkOperation {
  operationId: string;
  kind: BenchmarkOperationKind;
  strategy: BenchmarkStrategy;
  round: number | null;
  warmup: boolean;
  sequenceInRound: number | null;
  modelIds: string[];
  merkleRoot: string | null;
  gasLimit: bigint;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createBenchmarkModelId(
  seriesId: string,
  strategy: BenchmarkStrategy,
  round: number,
  index: number
): string {
  return sha256(`${seriesId}:${strategy}:${round}:${index}`).slice(0, 24);
}

export function createBenchmarkMerkleRoot(seriesId: string, round: number): string {
  return `0x${sha256(`${seriesId}:merkle:${round}`)}`;
}

export function buildBenchmarkOperationPlan(seriesId: string): BenchmarkOperation[] {
  const plan: BenchmarkOperation[] = [
    {
      operationId: "deployment:individual",
      kind: "deployment",
      strategy: "individual",
      round: null,
      warmup: false,
      sequenceInRound: null,
      modelIds: [],
      merkleRoot: null,
      gasLimit: SEPOLIA_BENCHMARK_GAS_LIMITS.deployment,
    },
    {
      operationId: "deployment:merkle",
      kind: "deployment",
      strategy: "merkle",
      round: null,
      warmup: false,
      sequenceInRound: null,
      modelIds: [],
      merkleRoot: null,
      gasLimit: SEPOLIA_BENCHMARK_GAS_LIMITS.deployment,
    },
  ];

  const totalRounds =
    SEPOLIA_BENCHMARK_CONFIG.warmupRounds + SEPOLIA_BENCHMARK_CONFIG.recordedRounds;

  for (let round = 0; round < totalRounds; round += 1) {
    const warmup = round === 0;
    const individualModelIds = Array.from(
      { length: SEPOLIA_BENCHMARK_CONFIG.batchSize },
      (_, index) => createBenchmarkModelId(seriesId, "individual", round, index)
    );

    for (const [index, modelId] of individualModelIds.entries()) {
      plan.push({
        operationId: `individual:${round}:${index}`,
        kind: "individual-registration",
        strategy: "individual",
        round,
        warmup,
        sequenceInRound: index,
        modelIds: [modelId],
        merkleRoot: null,
        gasLimit: SEPOLIA_BENCHMARK_GAS_LIMITS.individualRegistration,
      });
    }

    plan.push({
      operationId: `merkle:${round}`,
      kind: "merkle-registration",
      strategy: "merkle",
      round,
      warmup,
      sequenceInRound: SEPOLIA_BENCHMARK_CONFIG.batchSize,
      modelIds: Array.from(
        { length: SEPOLIA_BENCHMARK_CONFIG.batchSize },
        (_, index) => createBenchmarkModelId(seriesId, "merkle", round, index)
      ),
      merkleRoot: createBenchmarkMerkleRoot(seriesId, round),
      gasLimit: SEPOLIA_BENCHMARK_GAS_LIMITS.merkleRegistration,
    });
  }

  return plan;
}
