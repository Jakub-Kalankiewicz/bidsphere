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

export interface BenchmarkTransactionRecord {
  operationId: string;
  kind: BenchmarkOperationKind;
  strategy: BenchmarkStrategy;
  round: number | null;
  warmup: boolean;
  sequenceInRound: number | null;
  status: "pending" | "confirmed";
  transactionHash: string;
  blockNumber: number | null;
  receiptStatus: number | null;
  confirmationsRequested: 1;
  gasEstimate: string;
  gasLimit: string;
  gasUsed: string | null;
  maxFeePerGasWei: string;
  maxPriorityFeePerGasWei: string;
  effectiveGasPriceWei: string | null;
  actualFeeWei: string | null;
  worstCaseFeeWei: string;
  submittedAtUtc: string;
  receiptAtUtc: string | null;
  submissionMs: number;
  confirmationMs: number | null;
  endToEndMs: number | null;
}

export interface BenchmarkRoundAggregate {
  strategy: BenchmarkStrategy;
  round: number;
  warmup: boolean;
  transactionCount: number;
  totalGasUsed: string;
  totalActualFeeWei: string;
  wallClockMs: number;
}

export interface SepoliaBenchmarkResult {
  schemaVersion: 1;
  seriesId: string;
  startedAtUtc: string;
  completedAtUtc: string | null;
  status: "running" | "completed" | "aborted";
  abortReason: string | null;
  network: "sepolia";
  chainId: 11155111;
  rpcProviderLabel: string | null;
  codeVersion: string;
  deployerAddress: string;
  contractAddresses: { individual: string | null; merkle: string | null };
  configuration: {
    batchSize: 10;
    warmupRounds: 1;
    recordedRounds: 5;
    receiptConfirmations: 1;
    receiptTimeoutMs: 600000;
    aggregateGasCeiling: "16500000";
    approvedMaximumWei: string;
  };
  plannedOperations: Array<Omit<BenchmarkOperation, "gasLimit"> & { gasLimit: string }>;
  transactions: BenchmarkTransactionRecord[];
  rounds: BenchmarkRoundAggregate[];
  totalGasUsed: string;
  totalActualFeeWei: string;
  reservedPendingWei: string;
  balanceBeforeWei: string;
  balanceAfterWei: string | null;
  runtime: { node: string; hardhat: string };
}

export interface BuildConfirmedTransactionRecordInput {
  operation: BenchmarkOperation;
  transactionHash: string;
  blockNumber: number;
  receiptStatus: number;
  gasEstimate: bigint;
  gasUsed: bigint;
  maxFeePerGasWei: bigint;
  maxPriorityFeePerGasWei: bigint;
  effectiveGasPriceWei: bigint;
  submittedAtUtc: string;
  receiptAtUtc: string;
  startedMs: number;
  broadcastMs: number;
  receiptMs: number;
}

export interface SepoliaBenchmarkPreflightReport {
  status: "passed";
  transactionSent: false;
  network: "sepolia";
  chainId: 11155111;
  deployerAddress: string;
  referenceContractAddress: string;
  referenceBytecodeMatches: true;
  referenceOwnerMatches: true;
  operationCount: 68;
  aggregateGasCeiling: "16500000";
  maxFeePerGasWei: string;
  maxPriorityFeePerGasWei: string;
  balanceWei: string;
  boundedMaximumCostWei: string;
  estimatedOperationGasTotal: string;
  estimatedActualCostWei: string;
  estimates: {
    deployment: string;
    individualRegistration: string;
    merkleRegistration: string;
  };
}

export interface BuildBenchmarkPreflightReportInput {
  chainId: bigint;
  deployerAddress: string;
  referenceContractAddress: string;
  bytecodeMatches: boolean;
  ownerMatches: boolean;
  operationPlan: BenchmarkOperation[];
  aggregateGasCeiling: bigint;
  maxFeePerGasWei: bigint;
  maxPriorityFeePerGasWei: bigint;
  balanceWei: bigint;
  estimates: {
    deployment: bigint;
    individualRegistration: bigint;
    merkleRegistration: bigint;
  };
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

export function calculateAggregateGasCeiling(plan: BenchmarkOperation[]): bigint {
  return plan.reduce((total, operation) => total + operation.gasLimit, 0n);
}

function assertBenchmarkEstimateWithinLimit(
  estimate: bigint,
  limit: bigint,
  label: string
): void {
  if (estimate <= 0n || estimate > limit) {
    throw new Error(`${label} estimate exceeds its benchmark gas ceiling`);
  }
}

function assertBenchmarkOperationComposition(plan: BenchmarkOperation[]): void {
  const expectedComposition: Array<{
    kind: BenchmarkOperationKind;
    count: number;
    gasLimit: bigint;
  }> = [
    {
      kind: "deployment",
      count: 2,
      gasLimit: SEPOLIA_BENCHMARK_GAS_LIMITS.deployment,
    },
    {
      kind: "individual-registration",
      count: 60,
      gasLimit: SEPOLIA_BENCHMARK_GAS_LIMITS.individualRegistration,
    },
    {
      kind: "merkle-registration",
      count: 6,
      gasLimit: SEPOLIA_BENCHMARK_GAS_LIMITS.merkleRegistration,
    },
  ];

  for (const { kind, count, gasLimit } of expectedComposition) {
    const operations = plan.filter((operation) => operation.kind === kind);
    if (
      operations.length !== count ||
      operations.some((operation) => operation.gasLimit !== gasLimit)
    ) {
      throw new Error("Benchmark operation plan does not match the required composition");
    }
  }
}

export function buildBenchmarkPreflightReport(
  input: BuildBenchmarkPreflightReportInput
): SepoliaBenchmarkPreflightReport {
  const expectedAggregateGasCeiling = 16_500_000n;
  if (input.chainId !== 11_155_111n) {
    throw new Error("The benchmark preflight must run on Sepolia");
  }
  if (!input.bytecodeMatches) {
    throw new Error("Reference contract runtime bytecode does not match the artifact");
  }
  if (!input.ownerMatches) {
    throw new Error("Reference contract owner does not match the benchmark wallet");
  }
  if (input.operationPlan.length !== 68) {
    throw new Error("Benchmark operation plan must contain exactly 68 operations");
  }
  assertBenchmarkOperationComposition(input.operationPlan);
  if (
    input.aggregateGasCeiling !== expectedAggregateGasCeiling ||
    calculateAggregateGasCeiling(input.operationPlan) !== expectedAggregateGasCeiling
  ) {
    throw new Error("Benchmark operation plan does not match the fixed aggregate gas ceiling");
  }
  if (input.maxFeePerGasWei <= 0n) {
    throw new Error("A positive maximum fee per gas is required");
  }
  if (input.maxPriorityFeePerGasWei < 0n) {
    throw new Error("Maximum priority fee per gas cannot be negative");
  }
  if (input.balanceWei <= 0n) {
    throw new Error("A positive Sepolia wallet balance is required");
  }

  assertBenchmarkEstimateWithinLimit(
    input.estimates.deployment,
    SEPOLIA_BENCHMARK_GAS_LIMITS.deployment,
    "Deployment"
  );
  assertBenchmarkEstimateWithinLimit(
    input.estimates.individualRegistration,
    SEPOLIA_BENCHMARK_GAS_LIMITS.individualRegistration,
    "Individual registration"
  );
  assertBenchmarkEstimateWithinLimit(
    input.estimates.merkleRegistration,
    SEPOLIA_BENCHMARK_GAS_LIMITS.merkleRegistration,
    "Merkle registration"
  );

  const boundedMaximumCostWei = expectedAggregateGasCeiling * input.maxFeePerGasWei;
  if (input.balanceWei < boundedMaximumCostWei) {
    throw new Error("Sepolia wallet balance does not cover the bounded maximum cost");
  }
  const estimatedOperationGasTotal =
    2n * input.estimates.deployment +
    60n * input.estimates.individualRegistration +
    6n * input.estimates.merkleRegistration;
  const report: SepoliaBenchmarkPreflightReport = {
    status: "passed",
    transactionSent: false,
    network: "sepolia",
    chainId: 11_155_111,
    deployerAddress: input.deployerAddress,
    referenceContractAddress: input.referenceContractAddress,
    referenceBytecodeMatches: true,
    referenceOwnerMatches: true,
    operationCount: 68,
    aggregateGasCeiling: "16500000",
    maxFeePerGasWei: input.maxFeePerGasWei.toString(),
    maxPriorityFeePerGasWei: input.maxPriorityFeePerGasWei.toString(),
    balanceWei: input.balanceWei.toString(),
    boundedMaximumCostWei: boundedMaximumCostWei.toString(),
    estimatedOperationGasTotal: estimatedOperationGasTotal.toString(),
    estimatedActualCostWei: (estimatedOperationGasTotal * input.maxFeePerGasWei).toString(),
    estimates: {
      deployment: input.estimates.deployment.toString(),
      individualRegistration: input.estimates.individualRegistration.toString(),
      merkleRegistration: input.estimates.merkleRegistration.toString(),
    },
  };
  assertSecretFree(report, []);
  return report;
}

export function parseApprovedMaximumWei(value: string | undefined): bigint {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error("Approved maximum must be digits only");
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error("Approved maximum must be greater than zero");
  }
  return parsed;
}

export function assertNextTransactionWithinBudget(input: {
  actualSpentWei: bigint;
  reservedPendingWei: bigint;
  nextGasLimit: bigint;
  maxFeePerGasWei: bigint;
  approvedMaximumWei: bigint;
}): void {
  const nextWorstCaseWei = input.nextGasLimit * input.maxFeePerGasWei;
  if (
    input.actualSpentWei + input.reservedPendingWei + nextWorstCaseWei >
    input.approvedMaximumWei
  ) {
    throw new Error("Next transaction exceeds the approved maximum cost");
  }
}

export function calculateActualFee(gasUsed: bigint, effectiveGasPriceWei: bigint): bigint {
  return gasUsed * effectiveGasPriceWei;
}

export function buildConfirmedTransactionRecord(
  input: BuildConfirmedTransactionRecordInput
): BenchmarkTransactionRecord {
  if (input.broadcastMs < input.startedMs || input.receiptMs < input.broadcastMs) {
    throw new Error("Transaction timings must be monotonic");
  }
  const submissionMs = input.broadcastMs - input.startedMs;
  const confirmationMs = input.receiptMs - input.broadcastMs;
  const endToEndMs = input.receiptMs - input.startedMs;
  const actualFeeWei = calculateActualFee(input.gasUsed, input.effectiveGasPriceWei);

  return {
    operationId: input.operation.operationId,
    kind: input.operation.kind,
    strategy: input.operation.strategy,
    round: input.operation.round,
    warmup: input.operation.warmup,
    sequenceInRound: input.operation.sequenceInRound,
    status: "confirmed",
    transactionHash: input.transactionHash,
    blockNumber: input.blockNumber,
    receiptStatus: input.receiptStatus,
    confirmationsRequested: 1,
    gasEstimate: input.gasEstimate.toString(),
    gasLimit: input.operation.gasLimit.toString(),
    gasUsed: input.gasUsed.toString(),
    maxFeePerGasWei: input.maxFeePerGasWei.toString(),
    maxPriorityFeePerGasWei: input.maxPriorityFeePerGasWei.toString(),
    effectiveGasPriceWei: input.effectiveGasPriceWei.toString(),
    actualFeeWei: actualFeeWei.toString(),
    worstCaseFeeWei: (input.operation.gasLimit * input.maxFeePerGasWei).toString(),
    submittedAtUtc: input.submittedAtUtc,
    receiptAtUtc: input.receiptAtUtc,
    submissionMs,
    confirmationMs,
    endToEndMs,
  };
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("receipt timeout")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export function assertSecretFree(value: unknown, forbiddenValues: readonly string[]): void {
  const forbidden = forbiddenValues.filter((entry) => entry.length > 0);
  const serialized = JSON.stringify(value) ?? "";
  if (forbidden.some((entry) => serialized.includes(entry))) {
    throw new Error("Secret value found");
  }

  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
    } else if (candidate !== null && typeof candidate === "object") {
      for (const [key, child] of Object.entries(candidate)) {
        if (/private.?key|rpc.?url|BLOCKCHAIN_PRIVATE_KEY|SEPOLIA_RPC_URL/i.test(key)) {
          throw new Error("Secret-shaped key found");
        }
        visit(child);
      }
    }
  };
  visit(value);
}
