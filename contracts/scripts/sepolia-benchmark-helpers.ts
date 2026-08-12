import { createHash, randomBytes } from "node:crypto";

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
  nonce: number;
  broadcastAcknowledged: boolean;
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
  broadcastAtUtc: string | null;
  receiptAtUtc: string | null;
  startedOffsetMs: number;
  broadcastOffsetMs: number | null;
  receiptOffsetMs: number | null;
  submissionMs: number | null;
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
  schemaVersion: 2;
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

export interface CreateInitialBenchmarkResultMetadata {
  seriesId: string;
  startedAtUtc: string;
  rpcProviderLabel: string | null;
  codeVersion: string;
  deployerAddress: string;
  approvedMaximumWei: bigint;
  balanceBeforeWei: bigint;
  runtime: { node: string; hardhat: string };
}

export interface BuildConfirmedTransactionRecordInput {
  operation: BenchmarkOperation;
  transactionHash: string;
  nonce: number;
  blockNumber: number;
  receiptStatus: number;
  gasEstimate: bigint;
  gasUsed: bigint;
  maxFeePerGasWei: bigint;
  maxPriorityFeePerGasWei: bigint;
  effectiveGasPriceWei: bigint;
  submittedAtUtc: string;
  broadcastAtUtc: string;
  receiptAtUtc: string;
  startedOffsetMs: number;
  broadcastOffsetMs: number;
  receiptOffsetMs: number;
}

export interface BuildPreBroadcastTransactionRecordInput {
  operation: BenchmarkOperation;
  transactionHash: string;
  nonce: number;
  gasEstimate: bigint;
  maxFeePerGasWei: bigint;
  maxPriorityFeePerGasWei: bigint;
  submittedAtUtc: string;
  startedOffsetMs: number;
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

export function createBenchmarkSeriesId(
  now = new Date(),
  randomBytesFn: (size: number) => Uint8Array = randomBytes
): string {
  const entropy = randomBytesFn(8);
  if (entropy.byteLength < 8) {
    throw new Error("Benchmark series IDs require at least 64 bits of entropy");
  }
  const filesystemSafeTimestamp = now.toISOString().replace(/[:.]/g, "-");
  return `sepolia-gas-latency-${filesystemSafeTimestamp}-${Buffer.from(
    entropy
  ).toString("hex")}`;
}

export function recoverSameHashStatusZeroReceipt<
  T extends { hash: string; status: number | null }
>(error: unknown, broadcastHash: string): T {
  if (error !== null && typeof error === "object") {
    const candidate = error as {
      code?: unknown;
      receipt?: unknown;
    };
    if (candidate.code === "TRANSACTION_REPLACED") throw error;
    if (
      candidate.code === "CALL_EXCEPTION" &&
      candidate.receipt !== null &&
      typeof candidate.receipt === "object"
    ) {
      const receipt = candidate.receipt as {
        hash?: unknown;
        status?: unknown;
      };
      if (
        typeof receipt.hash === "string" &&
        receipt.hash.toLowerCase() === broadcastHash.toLowerCase() &&
        receipt.status === 0
      ) {
        return candidate.receipt as T;
      }
    }
  }
  throw error;
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

export function buildPreBroadcastTransactionRecord(
  input: BuildPreBroadcastTransactionRecordInput
): BenchmarkTransactionRecord {
  return {
    operationId: input.operation.operationId,
    kind: input.operation.kind,
    strategy: input.operation.strategy,
    round: input.operation.round,
    warmup: input.operation.warmup,
    sequenceInRound: input.operation.sequenceInRound,
    status: "pending",
    transactionHash: input.transactionHash,
    nonce: input.nonce,
    broadcastAcknowledged: false,
    blockNumber: null,
    receiptStatus: null,
    confirmationsRequested: 1,
    gasEstimate: input.gasEstimate.toString(),
    gasLimit: input.operation.gasLimit.toString(),
    gasUsed: null,
    maxFeePerGasWei: input.maxFeePerGasWei.toString(),
    maxPriorityFeePerGasWei: input.maxPriorityFeePerGasWei.toString(),
    effectiveGasPriceWei: null,
    actualFeeWei: null,
    worstCaseFeeWei: (
      input.operation.gasLimit * input.maxFeePerGasWei
    ).toString(),
    submittedAtUtc: input.submittedAtUtc,
    broadcastAtUtc: null,
    receiptAtUtc: null,
    startedOffsetMs: input.startedOffsetMs,
    broadcastOffsetMs: null,
    receiptOffsetMs: null,
    submissionMs: null,
    confirmationMs: null,
    endToEndMs: null,
  };
}

export function acknowledgeTransactionBroadcast(
  record: BenchmarkTransactionRecord,
  timing: { broadcastAtUtc: string; broadcastOffsetMs: number }
): BenchmarkTransactionRecord {
  if (
    record.status !== "pending" ||
    record.broadcastAcknowledged ||
    timing.broadcastOffsetMs < record.startedOffsetMs
  ) {
    throw new Error("Transaction broadcast acknowledgement is invalid");
  }
  return {
    ...record,
    broadcastAcknowledged: true,
    broadcastAtUtc: timing.broadcastAtUtc,
    broadcastOffsetMs: timing.broadcastOffsetMs,
    submissionMs: timing.broadcastOffsetMs - record.startedOffsetMs,
  };
}

export function aggregateRound(
  records: readonly BenchmarkTransactionRecord[]
): BenchmarkRoundAggregate {
  const first = records[0];
  if (!first || first.round === null) {
    throw new Error("A round aggregate requires at least one round transaction");
  }
  if (
    records.some(
      (record) =>
        record.status !== "confirmed" ||
        record.round !== first.round ||
        record.strategy !== first.strategy ||
        record.warmup !== first.warmup ||
        record.gasUsed === null ||
        record.actualFeeWei === null ||
        record.receiptAtUtc === null ||
        record.receiptOffsetMs === null ||
        record.endToEndMs === null
    )
  ) {
    throw new Error("A round aggregate requires matching confirmed transactions");
  }
  const startedTimes = records.map((record) => record.startedOffsetMs);
  const receiptTimes = records.map((record) => record.receiptOffsetMs!);
  const roundStartedMs = Math.min(...startedTimes);
  const roundReceiptMs = Math.max(...receiptTimes);
  if (
    startedTimes.some((time) => !Number.isFinite(time) || time < 0) ||
    receiptTimes.some((time) => !Number.isFinite(time) || time < 0) ||
    roundReceiptMs < roundStartedMs
  ) {
    throw new Error("A round aggregate requires valid chronological timestamps");
  }

  return {
    strategy: first.strategy,
    round: first.round,
    warmup: first.warmup,
    transactionCount: records.length,
    totalGasUsed: records
      .reduce((total, record) => total + BigInt(record.gasUsed!), 0n)
      .toString(),
    totalActualFeeWei: records
      .reduce((total, record) => total + BigInt(record.actualFeeWei!), 0n)
      .toString(),
    wallClockMs: roundReceiptMs - roundStartedMs,
  };
}

export function calculateReservedPendingWei(
  records: readonly BenchmarkTransactionRecord[]
): bigint {
  return records.reduce(
    (total, record) =>
      record.status === "pending" ? total + BigInt(record.worstCaseFeeWei) : total,
    0n
  );
}

function deriveBenchmarkProgress(result: SepoliaBenchmarkResult): Pick<
  SepoliaBenchmarkResult,
  "rounds" | "totalGasUsed" | "totalActualFeeWei" | "reservedPendingWei"
> {
  const confirmed = result.transactions.filter(
    (record) => record.status === "confirmed"
  );
  const totalGasUsed = confirmed.reduce(
    (total, record) => total + BigInt(record.gasUsed ?? "0"),
    0n
  );
  const totalActualFeeWei = confirmed.reduce(
    (total, record) => total + BigInt(record.actualFeeWei ?? "0"),
    0n
  );
  const rounds: BenchmarkRoundAggregate[] = [];
  const totalRounds =
    SEPOLIA_BENCHMARK_CONFIG.warmupRounds +
    SEPOLIA_BENCHMARK_CONFIG.recordedRounds;

  for (const strategy of ["individual", "merkle"] as const) {
    for (let round = 0; round < totalRounds; round += 1) {
      const records = confirmed.filter(
        (record) => record.strategy === strategy && record.round === round
      );
      if (records.length > 0) {
        const aggregate = aggregateRound(records);
        rounds.push(aggregate);
      }
    }
  }

  return {
    rounds,
    totalGasUsed: totalGasUsed.toString(),
    totalActualFeeWei: totalActualFeeWei.toString(),
    reservedPendingWei: calculateReservedPendingWei(result.transactions).toString(),
  };
}

export function createInitialBenchmarkResult(
  metadata: CreateInitialBenchmarkResultMetadata,
  operations: readonly BenchmarkOperation[]
): SepoliaBenchmarkResult {
  if (calculateAggregateGasCeiling([...operations]) !== 16_500_000n) {
    throw new Error("Benchmark operation plan must use the fixed aggregate gas ceiling");
  }

  return {
    schemaVersion: 2,
    seriesId: metadata.seriesId,
    startedAtUtc: metadata.startedAtUtc,
    completedAtUtc: null,
    status: "running",
    abortReason: null,
    network: "sepolia",
    chainId: 11_155_111,
    rpcProviderLabel: metadata.rpcProviderLabel,
    codeVersion: metadata.codeVersion,
    deployerAddress: metadata.deployerAddress,
    contractAddresses: { individual: null, merkle: null },
    configuration: {
      batchSize: 10,
      warmupRounds: 1,
      recordedRounds: 5,
      receiptConfirmations: 1,
      receiptTimeoutMs: 600000,
      aggregateGasCeiling: "16500000",
      approvedMaximumWei: metadata.approvedMaximumWei.toString(),
    },
    plannedOperations: operations.map(({ gasLimit, ...operation }) => ({
      ...operation,
      gasLimit: gasLimit.toString(),
    })),
    transactions: [],
    rounds: [],
    totalGasUsed: "0",
    totalActualFeeWei: "0",
    reservedPendingWei: "0",
    balanceBeforeWei: metadata.balanceBeforeWei.toString(),
    balanceAfterWei: null,
    runtime: { ...metadata.runtime },
  };
}

export function completeBenchmarkResult(
  result: SepoliaBenchmarkResult,
  balanceAfterWei: bigint
): SepoliaBenchmarkResult {
  if (
    result.transactions.length !== 68 ||
    result.transactions.some(
      (record) => record.status !== "confirmed" || record.receiptStatus !== 1
    )
  ) {
    throw new Error("Completion requires exactly 68 confirmed status-one records");
  }
  const { individual, merkle } = result.contractAddresses;
  const ethereumAddressPattern = /^0x[0-9a-fA-F]{40}$/;
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  if (
    !individual ||
    !merkle ||
    !ethereumAddressPattern.test(individual) ||
    !ethereumAddressPattern.test(merkle) ||
    individual.toLowerCase() === zeroAddress ||
    merkle.toLowerCase() === zeroAddress ||
    individual.toLowerCase() === merkle.toLowerCase()
  ) {
    throw new Error("Completion requires two valid nonzero distinct contract addresses");
  }

  const canonicalOperations = buildBenchmarkOperationPlan(result.seriesId);
  const transactionOperationIds = result.transactions.map(
    (record) => record.operationId
  );
  const transactionHashes = result.transactions.map((record) =>
    record.transactionHash.toLowerCase()
  );
  const transactionNonces = result.transactions.map((record) => record.nonce);
  if (
    result.plannedOperations.length !== 68 ||
    new Set(transactionOperationIds).size !== 68 ||
    new Set(transactionHashes).size !== 68
  ) {
    throw new Error("Completion operation topology does not match the plan");
  }
  if (
    new Set(transactionNonces).size !== 68 ||
    result.transactions.some(
      (record) =>
        !record.broadcastAcknowledged ||
        record.broadcastAtUtc === null ||
        record.submissionMs === null ||
        !Number.isSafeInteger(record.nonce) ||
        record.nonce < 0
    )
  ) {
    throw new Error("Completion broadcast evidence does not match the plan");
  }
  for (const [index, canonical] of canonicalOperations.entries()) {
    const planned = result.plannedOperations[index];
    const record = result.transactions[index];
    const plannedModelIdsMatch =
      planned.modelIds.length === canonical.modelIds.length &&
      planned.modelIds.every(
        (modelId, modelIndex) => modelId === canonical.modelIds[modelIndex]
      );
    if (
      planned.operationId !== canonical.operationId ||
      planned.kind !== canonical.kind ||
      planned.strategy !== canonical.strategy ||
      planned.round !== canonical.round ||
      planned.warmup !== canonical.warmup ||
      planned.sequenceInRound !== canonical.sequenceInRound ||
      !plannedModelIdsMatch ||
      planned.merkleRoot !== canonical.merkleRoot ||
      planned.gasLimit !== canonical.gasLimit.toString() ||
      record.operationId !== canonical.operationId ||
      record.kind !== canonical.kind ||
      record.strategy !== canonical.strategy ||
      record.round !== canonical.round ||
      record.warmup !== canonical.warmup ||
      record.sequenceInRound !== canonical.sequenceInRound ||
      record.gasLimit !== canonical.gasLimit.toString()
    ) {
      throw new Error("Completion operation topology does not match the plan");
    }
  }

  const progress = deriveBenchmarkProgress(result);
  if (progress.rounds.length !== 12) {
    throw new Error("Completion round topology must contain twelve aggregates");
  }
  const roundKeys = new Set<string>();
  for (const round of progress.rounds) {
    const key = `${round.strategy}:${round.round}`;
    const expectedTransactionCount = round.strategy === "individual" ? 10 : 1;
    if (
      round.round < 0 ||
      round.round >= 6 ||
      round.warmup !== (round.round === 0) ||
      round.transactionCount !== expectedTransactionCount ||
      roundKeys.has(key)
    ) {
      throw new Error("Completion round topology does not match the benchmark");
    }
    roundKeys.add(key);
  }
  for (const strategy of ["individual", "merkle"] as const) {
    for (let round = 0; round < 6; round += 1) {
      if (!roundKeys.has(`${strategy}:${round}`)) {
        throw new Error("Completion round topology does not match the benchmark");
      }
    }
  }

  return {
    ...result,
    ...progress,
    status: "completed",
    abortReason: null,
    completedAtUtc: new Date().toISOString(),
    balanceAfterWei: balanceAfterWei.toString(),
  };
}

export function abortBenchmarkResult(
  result: SepoliaBenchmarkResult,
  reason: string,
  balanceAfterWei: bigint | null
): SepoliaBenchmarkResult {
  return {
    ...result,
    ...deriveBenchmarkProgress(result),
    status: "aborted",
    abortReason: reason,
    completedAtUtc: new Date().toISOString(),
    balanceAfterWei: balanceAfterWei?.toString() ?? null,
  };
}

export function buildConfirmedTransactionRecord(
  input: BuildConfirmedTransactionRecordInput
): BenchmarkTransactionRecord {
  if (
    input.broadcastOffsetMs < input.startedOffsetMs ||
    input.receiptOffsetMs < input.broadcastOffsetMs
  ) {
    throw new Error("Transaction timings must be monotonic");
  }
  const submissionMs = input.broadcastOffsetMs - input.startedOffsetMs;
  const confirmationMs = input.receiptOffsetMs - input.broadcastOffsetMs;
  const endToEndMs = input.receiptOffsetMs - input.startedOffsetMs;
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
    nonce: input.nonce,
    broadcastAcknowledged: true,
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
    broadcastAtUtc: input.broadcastAtUtc,
    receiptAtUtc: input.receiptAtUtc,
    startedOffsetMs: input.startedOffsetMs,
    broadcastOffsetMs: input.broadcastOffsetMs,
    receiptOffsetMs: input.receiptOffsetMs,
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
  const visited = new WeakSet<object>();

  const assertNoForbiddenLiteral = (candidate: string): void => {
    if (forbidden.some((entry) => candidate.includes(entry))) {
      throw new Error("Secret value found");
    }
  };

  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      assertNoForbiddenLiteral(candidate);
      return;
    }
    if (candidate === null || typeof candidate !== "object") {
      return;
    }
    if (visited.has(candidate)) {
      return;
    }
    visited.add(candidate);

    for (const [key, child] of Object.entries(candidate)) {
      assertNoForbiddenLiteral(key);
      if (/private.?key|rpc.?url|BLOCKCHAIN_PRIVATE_KEY|SEPOLIA_RPC_URL/i.test(key)) {
        throw new Error("Secret-shaped key found");
      }
      visit(child);
    }
  };
  visit(value);
}
