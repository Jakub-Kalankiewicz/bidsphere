import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNextTransactionWithinBudget,
  assertSecretFree,
  buildBenchmarkOperationPlan,
  buildConfirmedTransactionRecord,
  calculateActualFee,
  calculateAggregateGasCeiling,
  parseApprovedMaximumWei,
  withTimeout,
} from "../contracts/scripts/sepolia-benchmark-helpers.ts";

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

test("accepts a top-level non-serializable value when no secret is present", () => {
  assert.doesNotThrow(() => assertSecretFree(undefined, ["secret"]));
});
