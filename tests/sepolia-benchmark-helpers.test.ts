import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateRound,
  abortBenchmarkResult,
  assertNextTransactionWithinBudget,
  assertSecretFree,
  buildBenchmarkPreflightReport,
  buildBenchmarkOperationPlan,
  buildConfirmedTransactionRecord,
  calculateActualFee,
  calculateAggregateGasCeiling,
  calculateReservedPendingWei,
  completeBenchmarkResult,
  createBenchmarkSeriesId,
  createInitialBenchmarkResult,
  parseApprovedMaximumWei,
  recoverSameHashStatusZeroReceipt,
  withTimeout,
} from "../contracts/scripts/sepolia-benchmark-helpers.ts";
import type { BenchmarkTransactionRecord } from "../contracts/scripts/sepolia-benchmark-helpers.ts";

test("builds exactly 68 operations with one warm-up and five recorded rounds", () => {
  const plan = buildBenchmarkOperationPlan("series-fixed");
  assert.equal(plan.length, 68);
  assert.equal(plan.filter((item) => item.kind === "deployment").length, 2);
  assert.equal(plan.filter((item) => item.kind === "individual-registration").length, 60);
  assert.equal(plan.filter((item) => item.kind === "merkle-registration").length, 6);
  assert.equal(plan.filter((item) => item.warmup).length, 11);
});

test("creates unique deterministic 24-character hexadecimal model IDs", () => {
  const plan = buildBenchmarkOperationPlan("series-fixed");
  const ids = plan.flatMap((item) => item.modelIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[0-9a-f]{24}$/.test(id)));
  assert.deepEqual(plan, buildBenchmarkOperationPlan("series-fixed"));
});

test("creates a deterministic filesystem-safe series ID with 64 bits of injected entropy", () => {
  const seriesId = createBenchmarkSeriesId(
    new Date("2026-08-12T10:11:12.345Z"),
    (size) => {
      assert.equal(size, 8);
      return Buffer.from("0123456789abcdef", "hex");
    }
  );

  assert.equal(
    seriesId,
    "sepolia-gas-latency-2026-08-12T10-11-12-345Z-0123456789abcdef"
  );
});

test("creates unique formatted series IDs across two calls", () => {
  const first = createBenchmarkSeriesId();
  const second = createBenchmarkSeriesId();
  const expectedFormat =
    /^sepolia-gas-latency-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{16,}$/;

  assert.match(first, expectedFormat);
  assert.match(second, expectedFormat);
  assert.notEqual(first, second);
});

test("derives the exact 16.5 million gas aggregate ceiling", () => {
  assert.equal(
    calculateAggregateGasCeiling(buildBenchmarkOperationPlan("series-fixed")),
    16_500_000n
  );
});

test("blocks the next transaction before the approved maximum can be exceeded", () => {
  assert.doesNotThrow(() =>
    assertNextTransactionWithinBudget({
      actualSpentWei: 400n,
      reservedPendingWei: 100n,
      nextGasLimit: 20n,
      maxFeePerGasWei: 10n,
      approvedMaximumWei: 700n,
    })
  );
  assert.throws(
    () =>
      assertNextTransactionWithinBudget({
        actualSpentWei: 401n,
        reservedPendingWei: 100n,
        nextGasLimit: 20n,
        maxFeePerGasWei: 10n,
        approvedMaximumWei: 700n,
      }),
    /approved maximum/
  );
});

test("parses only positive digit-only approved maximums", () => {
  assert.equal(parseApprovedMaximumWei("700"), 700n);
  assert.throws(() => parseApprovedMaximumWei("0"));
  assert.throws(() => parseApprovedMaximumWei("700 wei"));
  assert.throws(() => parseApprovedMaximumWei(undefined));
});

test("calculates the exact fee from the confirmed receipt", () => {
  assert.equal(calculateActualFee(94_309n, 1_108_566_493n), 104_547_797_388_337n);
});

test("builds serializable records with monotonic confirmed durations", () => {
  const record = buildConfirmedTransactionRecord({
    operation: buildBenchmarkOperationPlan("series-fixed")[2],
    transactionHash: "0xabc",
    receiptStatus: 1,
    blockNumber: 123,
    gasEstimate: 100_000n,
    gasUsed: 94_309n,
    maxFeePerGasWei: 2_000_000_000n,
    maxPriorityFeePerGasWei: 1_000_000_000n,
    effectiveGasPriceWei: 1_108_566_493n,
    submittedAtUtc: "2026-08-12T10:00:00.000Z",
    receiptAtUtc: "2026-08-12T10:00:01.000Z",
    startedMs: 100,
    broadcastMs: 125,
    receiptMs: 1125,
  });

  assert.deepEqual(record, {
    operationId: "individual:0:0",
    kind: "individual-registration",
    strategy: "individual",
    round: 0,
    warmup: true,
    sequenceInRound: 0,
    status: "confirmed",
    transactionHash: "0xabc",
    blockNumber: 123,
    receiptStatus: 1,
    confirmationsRequested: 1,
    gasEstimate: "100000",
    gasLimit: "150000",
    gasUsed: "94309",
    maxFeePerGasWei: "2000000000",
    maxPriorityFeePerGasWei: "1000000000",
    effectiveGasPriceWei: "1108566493",
    actualFeeWei: "104547797388337",
    worstCaseFeeWei: "300000000000000",
    submittedAtUtc: "2026-08-12T10:00:00.000Z",
    receiptAtUtc: "2026-08-12T10:00:01.000Z",
    submissionMs: 25,
    confirmationMs: 1000,
    endToEndMs: 1025,
  });
});

test("rejects a successful transaction replacement receipt", () => {
  const replacementError = Object.assign(new Error("transaction replaced"), {
    code: "TRANSACTION_REPLACED",
    receipt: { hash: "0xreplacement", status: 1 },
  });

  assert.throws(
    () => recoverSameHashStatusZeroReceipt(replacementError, "0xoriginal"),
    /transaction replaced/
  );
});

test("rejects a different-hash status-zero receipt", () => {
  const waitError = Object.assign(new Error("execution reverted"), {
    code: "CALL_EXCEPTION",
    receipt: { hash: "0xdifferent", status: 0 },
  });

  assert.throws(
    () => recoverSameHashStatusZeroReceipt(waitError, "0xoriginal"),
    /execution reverted/
  );
});

test("recovers a same-hash status-zero receipt for partial evidence", () => {
  const receipt = { hash: "0xoriginal", status: 0 };
  const waitError = Object.assign(new Error("execution reverted"), {
    code: "CALL_EXCEPTION",
    receipt,
  });

  assert.equal(
    recoverSameHashStatusZeroReceipt(waitError, "0xoriginal"),
    receipt
  );
});

test("aggregates ten confirmed individual transactions into one round", () => {
  const operation = buildBenchmarkOperationPlan("series-fixed")[2];
  const literalValues = [
    { gasUsed: "1", actualFeeWei: "10", submittedMs: 100, receiptMs: 200 },
    { gasUsed: "2", actualFeeWei: "20", submittedMs: 300, receiptMs: 400 },
    { gasUsed: "3", actualFeeWei: "30", submittedMs: 500, receiptMs: 600 },
    { gasUsed: "4", actualFeeWei: "40", submittedMs: 700, receiptMs: 800 },
    { gasUsed: "5", actualFeeWei: "50", submittedMs: 900, receiptMs: 1000 },
    { gasUsed: "6", actualFeeWei: "60", submittedMs: 1100, receiptMs: 1200 },
    { gasUsed: "7", actualFeeWei: "70", submittedMs: 1300, receiptMs: 1400 },
    { gasUsed: "8", actualFeeWei: "80", submittedMs: 1500, receiptMs: 1600 },
    { gasUsed: "9", actualFeeWei: "90", submittedMs: 1700, receiptMs: 1800 },
    { gasUsed: "10", actualFeeWei: "100", submittedMs: 1900, receiptMs: 2100 },
  ] as const;
  const records: BenchmarkTransactionRecord[] = literalValues.map((value, index) => ({
    operationId: `individual:0:${index}`,
    kind: "individual-registration",
    strategy: "individual",
    round: 0,
    warmup: true,
    sequenceInRound: index,
    status: "confirmed",
    transactionHash: `0x${index}`,
    blockNumber: 100 + index,
    receiptStatus: 1,
    confirmationsRequested: 1,
    gasEstimate: value.gasUsed,
    gasLimit: operation.gasLimit.toString(),
    gasUsed: value.gasUsed,
    maxFeePerGasWei: "15",
    maxPriorityFeePerGasWei: "1",
    effectiveGasPriceWei: "10",
    actualFeeWei: value.actualFeeWei,
    worstCaseFeeWei: "2250000",
    submittedAtUtc: new Date(value.submittedMs).toISOString(),
    receiptAtUtc: new Date(value.receiptMs).toISOString(),
    submissionMs: 25,
    confirmationMs: value.receiptMs - value.submittedMs - 25,
    endToEndMs: value.receiptMs - value.submittedMs,
  }));

  assert.deepEqual(aggregateRound(records), {
    strategy: "individual",
    round: 0,
    warmup: true,
    transactionCount: 10,
    totalGasUsed: "55",
    totalActualFeeWei: "550",
    wallClockMs: 2000,
  });
});

test("reserves only the worst-case cost of pending transactions", () => {
  const confirmed = buildConfirmedTransactionRecord({
    operation: buildBenchmarkOperationPlan("series-fixed")[2],
    transactionHash: "0xconfirmed",
    receiptStatus: 1,
    blockNumber: 123,
    gasEstimate: 1n,
    gasUsed: 1n,
    maxFeePerGasWei: 1n,
    maxPriorityFeePerGasWei: 0n,
    effectiveGasPriceWei: 1n,
    submittedAtUtc: "2026-08-12T10:00:00.000Z",
    receiptAtUtc: "2026-08-12T10:00:00.001Z",
    startedMs: 100,
    broadcastMs: 100,
    receiptMs: 101,
  });
  const pending: BenchmarkTransactionRecord = {
    ...confirmed,
    operationId: "individual:0:1",
    status: "pending",
    blockNumber: null,
    receiptStatus: null,
    gasUsed: null,
    effectiveGasPriceWei: null,
    actualFeeWei: null,
    worstCaseFeeWei: "225",
    receiptAtUtc: null,
    confirmationMs: null,
    endToEndMs: null,
  };

  assert.equal(calculateReservedPendingWei([confirmed, pending]), 225n);
  assert.equal(calculateReservedPendingWei([confirmed]), 0n);
});

function createResultMetadata() {
  return {
    seriesId: "series-state",
    startedAtUtc: "2026-08-12T10:00:00.000Z",
    rpcProviderLabel: "test provider",
    codeVersion: "abc123",
    deployerAddress: "0x1234",
    approvedMaximumWei: 999n,
    balanceBeforeWei: 1_000n,
    runtime: { node: "v24.0.0", hardhat: "2.22.0" },
  };
}

function createConfirmedPlanRecords(): BenchmarkTransactionRecord[] {
  return buildBenchmarkOperationPlan("series-state").map((operation, index) =>
    buildConfirmedTransactionRecord({
      operation,
      transactionHash: `0x${index}`,
      receiptStatus: 1,
      blockNumber: 1_000 + index,
      gasEstimate: 1n,
      gasUsed: 1n,
      maxFeePerGasWei: 3n,
      maxPriorityFeePerGasWei: 1n,
      effectiveGasPriceWei: 2n,
      submittedAtUtc: new Date(index).toISOString(),
      receiptAtUtc: new Date(index + 1).toISOString(),
      startedMs: index,
      broadcastMs: index,
      receiptMs: index + 1,
    })
  );
}

function createCompletableResult() {
  const initial = createInitialBenchmarkResult(
    createResultMetadata(),
    buildBenchmarkOperationPlan("series-state")
  );
  const transactions = createConfirmedPlanRecords();
  const rounds = (["individual", "merkle"] as const).flatMap((strategy) =>
    Array.from({ length: 6 }, (_, round) =>
      aggregateRound(
        transactions.filter(
          (record) => record.strategy === strategy && record.round === round
        )
      )
    )
  );
  return {
    ...initial,
    contractAddresses: {
      individual: "0x1111111111111111111111111111111111111111",
      merkle: "0x2222222222222222222222222222222222222222",
    },
    transactions,
    rounds,
  };
}

test("creates the serializable running result before any transaction", () => {
  const operations = buildBenchmarkOperationPlan("series-state");
  const result = createInitialBenchmarkResult(createResultMetadata(), operations);

  assert.equal(result.status, "running");
  assert.equal(result.transactions.length, 0);
  assert.equal(result.plannedOperations.length, 68);
  assert.equal(result.plannedOperations[0].gasLimit, "1500000");
  assert.equal(result.configuration.approvedMaximumWei, "999");
  assert.equal(result.balanceBeforeWei, "1000");
  assert.equal(result.totalGasUsed, "0");
  assert.equal(result.totalActualFeeWei, "0");
  assert.equal(result.reservedPendingWei, "0");
});

test("completes only 68 successful receipts and derives totals and round aggregates", () => {
  const completable = createCompletableResult();
  const result = completeBenchmarkResult(completable, 864n);

  assert.equal(result.status, "completed");
  assert.match(result.completedAtUtc ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.totalGasUsed, "68");
  assert.equal(result.totalActualFeeWei, "136");
  assert.equal(result.reservedPendingWei, "0");
  assert.equal(result.balanceAfterWei, "864");
  assert.equal(result.rounds.length, 12);
  assert.deepEqual(result.rounds[0], {
    strategy: "individual",
    round: 0,
    warmup: true,
    transactionCount: 10,
    totalGasUsed: "10",
    totalActualFeeWei: "20",
    wallClockMs: 10,
  });

  assert.throws(
    () => completeBenchmarkResult({ ...completable, transactions: [] }, 1_000n),
    /68 confirmed status-one/
  );
  const failedRecords = createConfirmedPlanRecords();
  failedRecords[67] = { ...failedRecords[67], receiptStatus: 0 };
  assert.throws(
    () =>
      completeBenchmarkResult(
        { ...completable, transactions: failedRecords },
        1_000n
      ),
    /68 confirmed status-one/
  );
});

test("rejects duplicate and mismatched completion operations", () => {
  const completable = createCompletableResult();
  const duplicateTransactions = [...completable.transactions];
  duplicateTransactions[67] = {
    ...duplicateTransactions[67],
    operationId: duplicateTransactions[0].operationId,
  };
  assert.throws(
    () =>
      completeBenchmarkResult(
        { ...completable, transactions: duplicateTransactions },
        864n
      ),
    /operation topology/
  );

  const missingPlannedOperation = [...completable.plannedOperations];
  missingPlannedOperation[67] = {
    ...missingPlannedOperation[67],
    operationId: "missing:operation",
  };
  assert.throws(
    () =>
      completeBenchmarkResult(
        { ...completable, plannedOperations: missingPlannedOperation },
        864n
      ),
    /operation topology/
  );

  const mismatchedTransactions = [...completable.transactions];
  mismatchedTransactions[2] = {
    ...mismatchedTransactions[2],
    warmup: false,
  };
  assert.throws(
    () =>
      completeBenchmarkResult(
        { ...completable, transactions: mismatchedTransactions },
        864n
      ),
    /operation topology/
  );
});

test("rejects a self-consistently altered plan and record pair", () => {
  const completable = createCompletableResult();
  const plannedOperations = [...completable.plannedOperations];
  const transactions = [...completable.transactions];
  plannedOperations[2] = { ...plannedOperations[2], kind: "deployment" };
  transactions[2] = { ...transactions[2], kind: "deployment" };

  assert.throws(
    () =>
      completeBenchmarkResult(
        { ...completable, plannedOperations, transactions },
        864n
      ),
    /operation topology/
  );
});

test("requires transaction records in canonical operation order", () => {
  const completable = createCompletableResult();

  assert.throws(
    () =>
      completeBenchmarkResult(
        { ...completable, transactions: [...completable.transactions].reverse() },
        864n
      ),
    /operation topology/
  );
});

test("rejects relabeled operations that would derive a 9-to-2 round split", () => {
  const completable = createCompletableResult();
  const plannedOperations = [...completable.plannedOperations];
  const transactions = [...completable.transactions];
  plannedOperations[11] = { ...plannedOperations[11], strategy: "merkle" };
  transactions[11] = { ...transactions[11], strategy: "merkle" };

  assert.throws(
    () =>
      completeBenchmarkResult(
        { ...completable, plannedOperations, transactions },
        864n
      ),
    /operation topology|round topology/
  );
});

test("requires valid nonzero distinct contract addresses for completion", () => {
  const completable = createCompletableResult();
  assert.throws(
    () =>
      completeBenchmarkResult(
        {
          ...completable,
          contractAddresses: {
            individual: null,
            merkle: "0x2222222222222222222222222222222222222222",
          },
        },
        864n
      ),
    /contract addresses/
  );
  assert.throws(
    () =>
      completeBenchmarkResult(
        {
          ...completable,
          contractAddresses: {
            individual: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
            merkle: "0xabcdefABCDEFabcdefABCDEFabcdefABCDEFabcd",
          },
        },
        864n
      ),
    /contract addresses/
  );
  assert.throws(
    () =>
      completeBenchmarkResult(
        {
          ...completable,
          contractAddresses: {
            individual: "0x1234",
            merkle: "0x2222222222222222222222222222222222222222",
          },
        },
        864n
      ),
    /contract addresses/
  );
  assert.throws(
    () =>
      completeBenchmarkResult(
        {
          ...completable,
          contractAddresses: {
            individual: "0x0000000000000000000000000000000000000000",
            merkle: "0x2222222222222222222222222222222222222222",
          },
        },
        864n
      ),
    /contract addresses/
  );
});

test("derives twelve correctly sized round aggregates instead of trusting input", () => {
  const completable = createCompletableResult();
  const missingInputRound = completeBenchmarkResult(
    { ...completable, rounds: completable.rounds.slice(0, 11) },
    864n
  );
  const malformedRounds = [...completable.rounds];
  malformedRounds[0] = { ...malformedRounds[0], transactionCount: 9 };
  const malformedInputRound = completeBenchmarkResult(
    { ...completable, rounds: malformedRounds },
    864n
  );

  assert.equal(missingInputRound.rounds.length, 12);
  assert.equal(missingInputRound.rounds[0].transactionCount, 10);
  assert.equal(malformedInputRound.rounds.length, 12);
  assert.equal(malformedInputRound.rounds[0].transactionCount, 10);
});

test("aborts while preserving confirmed totals and pending reservation", () => {
  const initial = createInitialBenchmarkResult(
    createResultMetadata(),
    buildBenchmarkOperationPlan("series-state")
  );
  const [confirmed, pendingSource] = createConfirmedPlanRecords();
  const pending: BenchmarkTransactionRecord = {
    ...pendingSource,
    status: "pending",
    blockNumber: null,
    receiptStatus: null,
    gasUsed: null,
    effectiveGasPriceWei: null,
    actualFeeWei: null,
    worstCaseFeeWei: "225",
    receiptAtUtc: null,
    confirmationMs: null,
    endToEndMs: null,
  };
  const result = abortBenchmarkResult(
    { ...initial, transactions: [confirmed, pending] },
    "receipt timeout",
    998n
  );

  assert.equal(result.status, "aborted");
  assert.equal(result.abortReason, "receipt timeout");
  assert.equal(result.totalGasUsed, "1");
  assert.equal(result.totalActualFeeWei, "2");
  assert.equal(result.reservedPendingWei, "225");
  assert.equal(result.balanceAfterWei, "998");
  assert.deepEqual(result.transactions, [confirmed, pending]);
});

test("rejects a receipt wait that exceeds its timeout", async () => {
  await assert.rejects(withTimeout(new Promise<never>(() => {}), 5), /receipt timeout/);
});

test("rejects secret-shaped keys and forbidden literal values", () => {
  assert.throws(() => assertSecretFree({ privateKey: "abc" }, []));
  assert.throws(() =>
    assertSecretFree(
      { rpc: "https://secret-rpc.invalid/key" },
      ["https://secret-rpc.invalid/key"]
    )
  );
});

const forbiddenEscapeCases = [
  { name: "a newline", value: "token\nline" },
  { name: "a quote", value: 'token"quote' },
  { name: "a backslash", value: "token\\slash" },
] as const;

for (const escapeCase of forbiddenEscapeCases) {
  test(`rejects a forbidden literal containing ${escapeCase.name} in a value`, () => {
    assert.throws(
      () =>
        assertSecretFree(
          { payload: `prefix-${escapeCase.value}-suffix` },
          [escapeCase.value]
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Secret value found" &&
        !error.message.includes(escapeCase.value)
    );
  });

  test(`rejects a forbidden literal containing ${escapeCase.name} in a key`, () => {
    assert.throws(
      () =>
        assertSecretFree(
          { [`prefix-${escapeCase.value}-suffix`]: "public" },
          [escapeCase.value]
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Secret value found" &&
        !error.message.includes(escapeCase.value)
    );
  });
}

test("accepts a top-level non-serializable value when no secret is present", () => {
  assert.doesNotThrow(() => assertSecretFree(undefined, ["secret"]));
});

test("accepts nested non-serializable non-secret values", () => {
  const value = { amount: 1n, callback: () => "public", marker: Symbol("public") };

  assert.doesNotThrow(() => assertSecretFree(value, ["secret"]));
});

test("accepts a cyclic non-secret object", () => {
  const value: Record<string, unknown> = { label: "public" };
  value.self = value;

  assert.doesNotThrow(() => assertSecretFree(value, ["secret"]));
});

test("builds a secret-free read-only preflight report from public estimates", () => {
  const report = buildBenchmarkPreflightReport({
    chainId: 11_155_111n,
    deployerAddress: "0x1D0a483dE7D587401b72E1B7658198eC840cCf2c",
    referenceContractAddress: "0x1F14E890e7428322F25Fa6aCfD0A89C045311102",
    bytecodeMatches: true,
    ownerMatches: true,
    operationPlan: buildBenchmarkOperationPlan("series-fixed"),
    aggregateGasCeiling: 16_500_000n,
    maxFeePerGasWei: 2_000_000_000n,
    maxPriorityFeePerGasWei: 1_000_000n,
    balanceWei: 50_000_000_000_000_000n,
    estimates: {
      deployment: 1_241_515n,
      individualRegistration: 94_309n,
      merkleRegistration: 255_008n,
    },
  });

  assert.deepEqual(report, {
    status: "passed",
    transactionSent: false,
    network: "sepolia",
    chainId: 11_155_111,
    deployerAddress: "0x1D0a483dE7D587401b72E1B7658198eC840cCf2c",
    referenceContractAddress: "0x1F14E890e7428322F25Fa6aCfD0A89C045311102",
    referenceBytecodeMatches: true,
    referenceOwnerMatches: true,
    operationCount: 68,
    aggregateGasCeiling: "16500000",
    maxFeePerGasWei: "2000000000",
    maxPriorityFeePerGasWei: "1000000",
    balanceWei: "50000000000000000",
    boundedMaximumCostWei: "33000000000000000",
    estimatedOperationGasTotal: "9671618",
    estimatedActualCostWei: "19343236000000000",
    estimates: {
      deployment: "1241515",
      individualRegistration: "94309",
      merkleRegistration: "255008",
    },
  });
  assert.doesNotThrow(() => assertSecretFree(report, []));
});

test("rejects a preflight report before serialization when its reference checks fail", () => {
  const input = {
    chainId: 11_155_111n,
    deployerAddress: "0x1D0a483dE7D587401b72E1B7658198eC840cCf2c",
    referenceContractAddress: "0x1F14E890e7428322F25Fa6aCfD0A89C045311102",
    bytecodeMatches: true,
    ownerMatches: true,
    operationPlan: buildBenchmarkOperationPlan("series-fixed"),
    aggregateGasCeiling: 16_500_000n,
    maxFeePerGasWei: 2_000_000_000n,
    maxPriorityFeePerGasWei: 1_000_000n,
    balanceWei: 50_000_000_000_000_000n,
    estimates: {
      deployment: 1_241_515n,
      individualRegistration: 94_309n,
      merkleRegistration: 255_008n,
    },
  };

  assert.throws(() => buildBenchmarkPreflightReport({ ...input, bytecodeMatches: false }));
  assert.throws(() => buildBenchmarkPreflightReport({ ...input, ownerMatches: false }));
});

test("rejects a plan whose composition differs despite its 68 operations and gas ceiling", () => {
  const operationPlan = buildBenchmarkOperationPlan("series-fixed");
  operationPlan[0] = {
    ...operationPlan[0],
    kind: "individual-registration",
    strategy: "individual",
  };
  assert.equal(operationPlan.length, 68);
  assert.equal(calculateAggregateGasCeiling(operationPlan), 16_500_000n);

  assert.throws(
    () =>
      buildBenchmarkPreflightReport({
        chainId: 11_155_111n,
        deployerAddress: "0x1D0a483dE7D587401b72E1B7658198eC840cCf2c",
        referenceContractAddress: "0x1F14E890e7428322F25Fa6aCfD0A89C045311102",
        bytecodeMatches: true,
        ownerMatches: true,
        operationPlan,
        aggregateGasCeiling: 16_500_000n,
        maxFeePerGasWei: 2_000_000_000n,
        maxPriorityFeePerGasWei: 1_000_000n,
        balanceWei: 50_000_000_000_000_000n,
        estimates: {
          deployment: 1_241_515n,
          individualRegistration: 94_309n,
          merkleRegistration: 255_008n,
        },
      }),
    /composition/
  );
});
