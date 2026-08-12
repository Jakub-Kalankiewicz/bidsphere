# Sepolia Gas and Confirmation-Latency Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run a bounded Sepolia experiment that compares individual and Merkle registration for batches of ten while recording gas, actual fees, and transaction-confirmation latency.

**Architecture:** Keep deterministic planning, budget arithmetic, record construction, and analysis in pure helpers covered by Node tests. Use two thin Hardhat entry points: a read-only preflight and a separately authorized transaction runner with atomic checkpoints after every broadcast or receipt. Preserve raw Sepolia JSON separately. For coordinated cross-environment analysis, generate a free Hardhat JSON reference with the same two-long-lived-contract, 68-operation topology and an exact-byte sibling SHA-256; retain the legacy CSV only for the thesis's original experiment.

**Tech Stack:** Node.js 24, TypeScript, Node test runner, Hardhat 2, ethers 6, Solidity, JSON research artifacts.

## Global Constraints

- Network must be `sepolia` with chain ID `11155111`; never fall back to local Hardhat or another public network.
- Use one batch size of `10`, one warm-up round, and five recorded rounds.
- Use two fresh `ModelRegistry` contracts and exactly 68 sequential transactions: two deployments, 60 individual registrations, and six Merkle registrations.
- Wait for one receipt confirmation per transaction and stop before sending the next transaction when any check fails.
- Use a ten-minute receipt timeout; a timed-out broadcast remains reserved against the approved cost and no later transaction is sent.
- Gas ceilings are fixed at `1500000` for each deployment, `150000` for each individual registration, and `750000` for each ten-model Merkle registration.
- The aggregate gas ceiling is exactly `16500000`; the maximum amount in wei is calculated from fresh fee data and requires explicit user approval before execution.
- Record warm-up transactions and their cost in raw data, but exclude them from descriptive statistics.
- Report all five recorded values plus median and min-max only; do not calculate p95 or inferential statistics.
- New Sepolia and matched-Hardhat evidence uses schema version `2` with series-relative monotonic offsets. Preserve the historical partial schema-version-1 Sepolia artifact unchanged as diagnostic evidence only.
- Never serialize the RPC URL, private key, cookies, environment-variable values, or authenticated application data.
- Keep Sepolia outputs separate from `measurements/raw/gas-local-hardhat.csv` and from existing Hardhat tables. Do not use that legacy fresh-contract CSV for the coordinated comparison; use the matched Hardhat JSON and its sibling checksum.
- Commit hashes may exist only in raw research metadata, never in thesis prose, tables, captions, or bibliography entries.
- Do not modify thesis chapters until the result is complete, reproducible, and separately approved by the user.
- Preserve all unrelated untracked files; stage only exact files named by the current task.

## File Map

- Create `contracts/scripts/sepolia-benchmark-helpers.ts`: pure configuration, operation planning, identifiers, budget checks, record arithmetic, and secret checks.
- Create `contracts/scripts/sepolia-benchmark-checkpoint.ts`: atomic raw-result checkpoint writer.
- Create `contracts/scripts/sepolia-benchmark-preflight.ts`: read-only Sepolia validation and whole-experiment cost bound.
- Create `contracts/scripts/sepolia-benchmark.ts`: two-contract sequential benchmark runner.
- Create `tests/sepolia-benchmark-helpers.test.ts`: pure planning, cost, timing, and serialization tests.
- Create `tests/sepolia-benchmark-checkpoint.test.ts`: filesystem behavior for running, completed, aborted, and secret-rejected checkpoints.
- Create `scripts/analyze-sepolia-benchmark.mjs`: raw validation and separate Hardhat-versus-Sepolia descriptive summary.
- Create `tests/sepolia-benchmark-analysis.test.mjs`: five-observation analysis fixtures and p95 exclusion.
- Modify `contracts/package.json`: add read-only preflight and transaction-runner commands.
- Modify `package.json`: include new tests and add the analysis command.
- Create after execution the canonical raw path returned by `join("measurements/raw/sepolia", `${seriesId}.json`)`, where `seriesId` is generated once as `sepolia-gas-latency-` plus the filesystem-safe UTC timestamp.
- Create after execution the derived path returned by `join("measurements/processed", `${seriesId}-summary.json`)`.
- Modify after successful validation `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/state.md`, `session-summary.md`, `experiment-protocol.md`, and `remaining-tests-plan.md`: record actual outcome and limitations.

---

### Task 1: Deterministic Benchmark Operation Plan

**Files:**
- Create: `contracts/scripts/sepolia-benchmark-helpers.ts`
- Create: `tests/sepolia-benchmark-helpers.test.ts`

**Interfaces:**
- Produces: `SEPOLIA_BENCHMARK_CONFIG`, `SEPOLIA_BENCHMARK_GAS_LIMITS`, `BenchmarkOperation`, `buildBenchmarkOperationPlan(seriesId: string): BenchmarkOperation[]`, `createBenchmarkModelId(seriesId: string, strategy: BenchmarkStrategy, round: number, index: number): string`, and `createBenchmarkMerkleRoot(seriesId: string, round: number): string`.
- Consumes: Node `crypto.createHash`; no Hardhat, provider, wallet, filesystem, or environment access.

- [ ] **Step 1: Write failing plan-count and uniqueness tests**

```ts
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
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts`

Expected: FAIL because `sepolia-benchmark-helpers.ts` and its exports do not exist.

- [ ] **Step 3: Implement the fixed configuration and operation plan**

```ts
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
```

Use SHA-256 of the literal tuple `seriesId:strategy:round:index` and take the first 24 lowercase hexadecimal characters for each model ID. Use SHA-256 of `seriesId:merkle:round` with a `0x` prefix for the root. Add two deployment operations first, then for rounds `0` through `5` add ten individual operations followed by one Merkle operation. Only round `0` has `warmup: true`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts`

Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Commit the independently testable operation plan**

```bash
git add contracts/scripts/sepolia-benchmark-helpers.ts tests/sepolia-benchmark-helpers.test.ts
git commit -m "test: define Sepolia benchmark operation plan"
```

### Task 2: Spend Limits, Transaction Records, and Timeout Semantics

**Files:**
- Modify: `contracts/scripts/sepolia-benchmark-helpers.ts`
- Modify: `tests/sepolia-benchmark-helpers.test.ts`

**Interfaces:**
- Consumes: `BenchmarkOperation[]` and gas limits from Task 1.
- Produces: `calculateAggregateGasCeiling(plan): bigint`, `parseApprovedMaximumWei(value: string | undefined): bigint`, `assertNextTransactionWithinBudget(input): void`, `calculateActualFee(gasUsed: bigint, effectiveGasPriceWei: bigint): bigint`, `buildConfirmedTransactionRecord(input): BenchmarkTransactionRecord`, `withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T>`, and `assertSecretFree(value: unknown, forbiddenValues: readonly string[]): void`.

Use this serializable record contract; pending records keep receipt-derived fields and `receiptAtUtc` as `null`:

```ts
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
```

- [ ] **Step 1: Add failing literal-fixture tests for the aggregate ceiling and budget gate**

```ts
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
```

- [ ] **Step 2: Add failing tests for fee arithmetic, monotonic durations, timeout, and secrets**

Use a literal confirmed-record fixture with `startedOffsetMs: 100`, `broadcastOffsetMs: 125`, `receiptOffsetMs: 1125`, `gasUsed: 94_309n`, and `effectiveGasPriceWei: 1_108_566_493n`. Assert submission `25`, confirmation `1000`, end-to-end `1025`, and exact fee `104_547_797_388_337` wei. Assert `withTimeout(new Promise(() => {}), 5)` rejects with `receipt timeout`, and assert a record containing either the key `privateKey` or literal value `https://secret-rpc.invalid/key` is rejected.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts`

Expected: FAIL because the budget, record, timeout, and secret functions are missing.

- [ ] **Step 4: Implement minimal pure arithmetic and validation**

```ts
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

export function calculateActualFee(
  gasUsed: bigint,
  effectiveGasPriceWei: bigint
): bigint {
  return gasUsed * effectiveGasPriceWei;
}
```

Implement `parseApprovedMaximumWei` as digits-only and greater than zero. `buildConfirmedTransactionRecord` converts bigint fields to decimal strings before serialization. `withTimeout` clears its timer in both resolution paths and emits one stable error. `assertSecretFree` recursively rejects keys matching `/private.?key|rpc.?url|BLOCKCHAIN_PRIVATE_KEY|SEPOLIA_RPC_URL/i` and rejects any non-empty forbidden literal found in serialized output.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts`

Expected: all helper tests pass, including the timeout test.

- [ ] **Step 6: Commit budget and record semantics**

```bash
git add contracts/scripts/sepolia-benchmark-helpers.ts tests/sepolia-benchmark-helpers.test.ts
git commit -m "test: enforce Sepolia benchmark spend limits"
```

### Task 3: Atomic Checkpoint Writer

**Files:**
- Create: `contracts/scripts/sepolia-benchmark-checkpoint.ts`
- Create: `tests/sepolia-benchmark-checkpoint.test.ts`

**Interfaces:**
- Consumes: `assertSecretFree` from Task 2.
- Produces: `writeBenchmarkCheckpoint(outputPath: string, result: SepoliaBenchmarkResult, forbiddenValues: readonly string[]): Promise<void>`.
- `SepoliaBenchmarkResult` is exported from `sepolia-benchmark-helpers.ts` with this stable top-level shape:

```ts
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
```

- [ ] **Step 1: Write a failing atomic-write test using a temporary directory**

Create a directory with `mkdtemp(join(tmpdir(), "bidsphere-sepolia-"))`. Write a minimal `running` result, read the canonical JSON, and assert its `seriesId` and status. Assert `${outputPath}.tmp` does not remain. Rewrite the same path with status `aborted` and `abortReason: "receipt timeout"`; assert the canonical file now contains the aborted checkpoint.

- [ ] **Step 2: Write a failing secret-rejection test**

Pass `forbiddenValues: ["https://secret-rpc.invalid/key", "private-key-literal"]` and a result whose metadata contains the RPC literal. Assert rejection and assert neither the canonical nor temporary file exists.

- [ ] **Step 3: Run checkpoint tests and verify RED**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-checkpoint.test.ts`

Expected: FAIL because the checkpoint writer does not exist.

- [ ] **Step 4: Implement mkdir, secret check, temporary write, and atomic rename**

```ts
export async function writeBenchmarkCheckpoint(
  outputPath: string,
  result: SepoliaBenchmarkResult,
  forbiddenValues: readonly string[]
): Promise<void> {
  assertSecretFree(result, forbiddenValues);
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}
```

The test cleanup belongs in the test file and removes only its unique temporary directory.

- [ ] **Step 5: Run checkpoint and helper tests and verify GREEN**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts tests/sepolia-benchmark-checkpoint.test.ts`

Expected: all tests pass and leave no `.tmp` file.

- [ ] **Step 6: Commit checkpointing**

```bash
git add contracts/scripts/sepolia-benchmark-checkpoint.ts tests/sepolia-benchmark-checkpoint.test.ts
git commit -m "test: checkpoint Sepolia benchmark results"
```

### Task 4: Read-Only Benchmark Preflight

**Files:**
- Create: `contracts/scripts/sepolia-benchmark-preflight.ts`
- Modify: `contracts/scripts/sepolia-benchmark-helpers.ts`
- Modify: `contracts/package.json`
- Modify: `tests/sepolia-benchmark-helpers.test.ts`

**Interfaces:**
- Consumes: operation plan, aggregate ceiling, gas-estimate assertion, Sepolia input validation, gas ceilings, Hardhat provider, current `ModelRegistry` artifact, and `SEPOLIA_BENCHMARK_REFERENCE_CONTRACT_ADDRESS`.
- Produces: command `npm run sepolia:benchmark:preflight` whose JSON output includes `transactionSent: false`, operation count `68`, gas ceiling `16500000`, fee data, bounded maximum cost, balance, reference contract address, bytecode match, owner match, and representative estimates.

The pure report builder returns this serializable contract:

```ts
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
```

- [ ] **Step 1: Add a failing test for building a secret-free preflight report**

Add `buildBenchmarkPreflightReport(input)` to the helper contract. Feed literal bigint values and assert decimal strings, `transactionSent === false`, operation count `68`, and no RPC/private-key key. Mutate `bytecodeMatches` or `ownerMatches` to false and assert rejection before a report is produced.

- [ ] **Step 2: Run the helper test and verify RED**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts`

Expected: FAIL because `buildBenchmarkPreflightReport` is missing.

- [ ] **Step 3: Implement the pure report builder and verification gates**

The report builder accepts only public/sanitized values. Require positive fee and balance, exact chain ID, matching reference runtime-bytecode hash, matching owner, and estimates at or below the three fixed ceilings. Calculate `boundedMaximumCostWei` as `16_500_000n * maxFeePerGasWei`. Calculate `estimatedOperationGasTotal` as `2 * deploymentEstimate + 60 * individualEstimate + 6 * merkleEstimate`, and multiply it by current `maxFeePerGasWei` for the conservative estimated actual cost.

- [ ] **Step 4: Implement the Hardhat preflight entry point**

Use `ethers.provider.getNetwork()`, `getFeeData()`, `getBalance()`, `getCode()`, `artifacts.readArtifact("ModelRegistry")`, and `ethers.getContractAt()`. Compare `ethers.keccak256(onChainCode)` with `ethers.keccak256(artifact.deployedBytecode)`, confirm `owner()` equals the test wallet, estimate one deployment, one unique individual registration, and one ten-ID Merkle registration, then print only the report JSON.

Add this exact script entry:

```json
"sepolia:benchmark:preflight": "hardhat run scripts/sepolia-benchmark-preflight.ts --network sepolia"
```

Do not write an output file and do not call a state-changing contract method.

- [ ] **Step 5: Run unit tests and TypeScript compilation**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts tests/sepolia-benchmark-checkpoint.test.ts`

Run: `npx tsc --noEmit`

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the read-only preflight**

```bash
git add contracts/scripts/sepolia-benchmark-preflight.ts contracts/scripts/sepolia-benchmark-helpers.ts contracts/package.json tests/sepolia-benchmark-helpers.test.ts
git commit -m "feat: preflight Sepolia benchmark budget"
```

### Task 5: Sequential Two-Contract Benchmark Runner

**Files:**
- Create: `contracts/scripts/sepolia-benchmark.ts`
- Create: `contracts/scripts/sepolia-benchmark-transaction.ts`
- Create: `tests/sepolia-benchmark-transaction.test.ts`
- Modify: `contracts/package.json`
- Modify: `contracts/scripts/sepolia-benchmark-helpers.ts`
- Modify: `package.json`
- Modify: `tests/sepolia-benchmark-helpers.test.ts`

**Interfaces:**
- Consumes: all Tasks 1-4 helpers, `SEPOLIA_BENCHMARK_MAX_COST_WEI`, `SEPOLIA_BENCHMARK_CODE_VERSION`, optional non-secret `SEPOLIA_BENCHMARK_RPC_PROVIDER_LABEL`, current fee data, and the dedicated signer.
- Produces: command `npm run sepolia:benchmark`, atomic raw `SepoliaBenchmarkResult`, two public contract addresses, 68 ordered transaction records, six individual round aggregates, and six Merkle round aggregates.

- [ ] **Step 1: Add failing tests for round aggregation and pending-cost reservation**

Construct ten literal confirmed individual records with gas values `1n` through `10n`, fees `10n` through `100n`, and start/end times spanning `100` through `2100`. Assert `aggregateRound(records)` returns gas `55`, fee `550`, transaction count `10`, and wall-clock `2000` ms. Construct one pending record with worst-case fee `225n` and assert `calculateReservedPendingWei` returns `225n` while confirmed records contribute zero.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts`

Expected: FAIL because aggregation and pending reservation are missing.

- [ ] **Step 3: Implement aggregation and result-state transitions**

Add `aggregateRound(records)`, `calculateReservedPendingWei(records)`, `createInitialBenchmarkResult(metadata, operations)`, `completeBenchmarkResult(result, balanceAfterWei)`, and `abortBenchmarkResult(result, reason, balanceAfterWei)`. All bigint output fields are decimal strings. Completion requires exactly 68 confirmed status-one records; otherwise it throws.

- [ ] **Step 4: Implement the runner setup and two deployments**

The runner validates Sepolia inputs, parses the approved maximum, requires a non-empty code version, accepts only a plain non-secret provider label matching `/^[A-Za-z0-9 ._-]{1,80}$/`, builds a unique series ID and operation plan, captures balance before, and writes the initial `running` checkpoint before any transaction. For every operation it obtains fresh fee data and gas estimate, applies the fixed gas limit and current `maxFeePerGas`/`maxPriorityFeePerGas`, then calls the budget gate before broadcasting.

Deploy the individual contract first and the Merkle contract second. Populate and locally sign every deployment or contract-call transaction, derive its exact hash and nonce, and checkpoint a `pending` pre-broadcast intent with its worst-case reserved cost. Only after that checkpoint succeeds, broadcast the exact signed bytes once. Checkpoint provider acknowledgement separately. After receipt, replace the pending record with the confirmed record, update actual cumulative spending, and checkpoint again. Never retry after response loss or a post-broadcast checkpoint failure.

- [ ] **Step 5: Implement sequential registration rounds and timing boundaries**

For each round `0` through `5`, execute its ten individual operations on the individual contract, then execute its one Merkle operation on the Merkle contract. Capture monotonic times with `performance.now()` and UTC timestamps with `new Date().toISOString()`. Use `withTimeout(transaction.wait(1), 600_000)`; on timeout retain the pending record and abort without sending another transaction.

Capture one monotonic origin for the series. Paid transaction records store
`startedOffsetMs`, `broadcastOffsetMs`, and `receiptOffsetMs`; durations and
round `wallClockMs` are derived only from those offsets. UTC timestamps are
parseable audit context but are never latency inputs.

Add this exact script entry:

```json
"sepolia:benchmark": "hardhat run scripts/sepolia-benchmark.ts --network sepolia"
```

- [ ] **Step 6: Implement one catch boundary that preserves partial evidence**

The top-level runner catch obtains a final read-only balance when possible, writes status `aborted` and a sanitized error message, and exits nonzero. It must not retry a broadcast, replace a gas ceiling, or delete a partial artifact. The successful path verifies all 68 receipt statuses, writes status `completed`, and prints only series ID, output path, public addresses, total gas, total fee, and status.

- [ ] **Step 7: Run helper, checkpoint, contract, and TypeScript tests**

Run from repository root:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/sepolia-benchmark-helpers.test.ts tests/sepolia-benchmark-checkpoint.test.ts tests/sepolia-benchmark-transaction.test.ts
cd contracts && npx tsc --noEmit && npm test
```

Expected: all Node tests pass, TypeScript exits 0, and Hardhat reports 12 passing tests.

- [ ] **Step 8: Commit the runner without executing Sepolia transactions**

```bash
git add contracts/scripts/sepolia-benchmark.ts contracts/scripts/sepolia-benchmark-helpers.ts contracts/package.json tests/sepolia-benchmark-helpers.test.ts
git commit -m "feat: run bounded Sepolia gas latency benchmark"
```

### Task 6: Raw Validation and Descriptive Analysis

Before analysis, run `contracts/scripts/benchmark-gas-sepolia-matched.ts` on
Hardhat. It deploys exactly two contracts once, executes the same canonical 68
operations as the Sepolia plan, requires 68 status-one receipts, records 12
round aggregates and Merkle counter transitions, then atomically writes the
final JSON and its exact-byte sibling SHA-256. Its focused real-contract tests
must isolate the exact 17,100-gas first-versus-later Merkle counter effect and
show that equivalent individual registrations have unchanged gas. It does not
read Sepolia credentials, make network calls, or modify the paid runner.
It requires `GAS_BENCHMARK_COMMIT`, accepts an optional
`HARDHAT_MATCHED_BENCHMARK_OUTPUT`, otherwise writes under
`measurements/raw/hardhat-sepolia-matched/`, and prints the exact raw path,
checksum path, and digest. Every submitted transaction uses the fixed gas limit
from the canonical plan and records the actual response gas limit and strategy
contract address. New matched evidence uses schema version `2`, stores
`startedOffsetMs` and `receiptOffsetMs` per transaction, and derives both
transaction duration and round wall-clock duration solely from those offsets.

**Files:**
- Create: `scripts/analyze-sepolia-benchmark.mjs`
- Create: `tests/sepolia-benchmark-analysis.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `summarizeFive`, strict Sepolia and matched-Hardhat validators, `compareRelevantContractSource`, and a coordinated summary builder.
- CLI consumes exactly three explicit paths: raw Sepolia JSON, matched Hardhat JSON, and output summary JSON. It automatically reads the exact sibling `<matched-hardhat.json>.sha256` as the fourth protected filesystem endpoint.

Use these analysis contracts:

```js
// Documented shapes; implementation remains plain JavaScript.
MatchedHardhatReference = {
  schemaVersion: 2,
  kind: "hardhat-sepolia-matched",
  status: "completed",
  network: "hardhat",
  chainId: 31337,
  topology: "one-long-lived-contract-per-strategy",
  codeVersion: string, // full 40-hex, equal to Sepolia raw
  runtime: {
    node: string,
    hardhat: string,
    solidityCompiler: {
      version: "0.8.19",
      optimizerEnabled: false,
      optimizerRuns: 200,
      evmVersion: "paris"
    }
  },
  transactions: [/* canonical 68 status-one receipts with contractAddress */],
  rounds: [/* 12 aggregates */],
  finalMerkleBatchCount: 6
};

SourceComparison = {
  codeVersionIdentifiersMatch: boolean,
  modelRegistrySourceUnchanged: boolean,
  bytecodeIdentityClaimed: false
};

SepoliaBenchmarkSummary = {
  seriesId: string,
  localReference: { seriesId: string, sha256: string, topology: string },
  generatedAtUtc: string,
  method: "five recorded observations; median and min-max",
  batchSize: 10,
  recordedRounds: 5,
  individual: {
    totalGas: { observations: string[5], statistics: { count: 5, min: string, median: string, max: string } },
    gasPerModel: { observations: number[5], statistics: { count: 5, min: number, median: number, max: number } },
    roundEndToEndMs: { observations: number[5], statistics: { count: 5, min: number, median: number, max: number } },
    actualFeeWei: { observations: string[5], statistics: object },
    actualFeeEth: { observations: string[5], statistics: object }
  },
  merkle: {
    totalGas: { observations: string[5], statistics: { count: 5, min: string, median: string, max: string } },
    gasPerModel: { observations: number[5], statistics: { count: 5, min: number, median: number, max: number } },
    roundEndToEndMs: { observations: number[5], statistics: { count: 5, min: number, median: number, max: number } },
    actualFeeWei: { observations: string[5], statistics: object },
    actualFeeEth: { observations: string[5], statistics: object }
  },
  comparison: {
    sepoliaMerkleGasSavingPct: number,
    localMerkleGasSavingPct: number,
    individualGasDifferenceFromLocalPct: number,
    merkleGasDifferenceFromLocalPct: number
  },
  sourceComparison: SourceComparison,
  limitations: string[]
};
```

- [ ] **Step 1: Write failing five-value and no-p95 tests**

```js
test("summarizes exactly five observations without p95", () => {
  const summary = summarizeFive([50, 10, 40, 20, 30]);
  assert.deepEqual(summary, { count: 5, min: 10, median: 30, max: 50 });
  assert.equal(Object.hasOwn(summary, "p95"), false);
});
```

Also assert that four or six values throw `/exactly five/`.

- [ ] **Step 2: Write failing validation and comparison tests with literal raw fixtures**

Build completed Sepolia and matched-Hardhat fixtures with 68 status-one transaction records, six rounds per strategy, two long-lived contracts, and five non-warm-up aggregates. Assert the analyzer excludes warm-up, preserves five observations in round order, sums gas and fee exactly, renders exact wei and deterministic ETH strings, and rejects broken `batchCount` progression, code-version mismatch, and the legacy CSV. Assert the serialized summary has no `p95`, `source`, or `localSource` key.

- [ ] **Step 3: Run analysis tests and verify RED**

Run: `node --test tests/sepolia-benchmark-analysis.test.mjs`

Expected: FAIL because the analyzer module does not exist.

- [ ] **Step 4: Implement strict raw validation and descriptive statistics**

Validation requires schema version `2`, network `sepolia`, chain ID `11155111`, status `completed`, 68 confirmed status-one transactions, contiguous nonces from the observed first nonce, complete broadcast evidence, ten-model batch size, one warm-up, five recorded rounds, two addresses, gas and fee bounds, exact duration equations, and arithmetic agreement among receipt gas, receipt fees, reconstructed round latency, round totals, and experiment totals. Completed schema-version-1 evidence is rejected with a legacy diagnostic-only message. `summarizeFive` sorts a copy and returns the middle value as median.

- [ ] **Step 5: Implement matched Hardhat reference and source-version limitation**

Validate Hardhat chain 31337, truthful runtime/compiler metadata including EVM
version `paris`, deployed-bytecode hash syntax, canonical 68-operation/12-round
topology, two addresses, every transaction's strategy address and fixed gas
limit, all receipt and aggregate arithmetic, and Merkle counter progression
`0 -> 1` through `5 -> 6`. Require the same full code-version identifier as
Sepolia. Verify the sibling lowercase SHA-256 against exact JSON bytes. Keep
source-comparison booleans, but exclude both commit identifiers from the
processed output and never infer deployed Sepolia bytecode identity from source
equality.

- [ ] **Step 6: Implement the three-path CLI and package scripts**

Protect the Sepolia JSON, matched JSON, checksum sibling, and output against
resolved, symbolic-link, and hard-link aliasing before reading or writing the
output. The legacy CSV remains valid for the original experiment only.

```json
"analyze:sepolia-benchmark": "node scripts/analyze-sepolia-benchmark.mjs"
```

Extend `test:verify` with `tests/sepolia-benchmark-helpers.test.ts`, `tests/sepolia-benchmark-checkpoint.test.ts`, and `tests/sepolia-benchmark-analysis.test.mjs`. Keep the existing test files and order otherwise unchanged.

- [ ] **Step 7: Run focused and full local verification**

Run:

```bash
npm run test:verify
npm run test:benchmark
npm run test:merkle
npm run lint
cd contracts && npx tsc --noEmit && npm test
```

Expected: every command exits 0; the exact updated test counts are recorded from output rather than predicted in documentation.

- [ ] **Step 8: Commit analysis and package wiring**

```bash
git add scripts/analyze-sepolia-benchmark.mjs tests/sepolia-benchmark-analysis.test.mjs package.json
git commit -m "test: analyze Sepolia benchmark observations"
```

### Task 7: Read-Only Preflight and Explicit Cost Approval

**Files:**
- No source changes expected.
- Read: `.env` without printing values.
- Read: `measurements/raw/sepolia/sepolia-smoke-2026-08-12T13-20-12-929Z.json` for the public reference contract address.

**Interfaces:**
- Consumes: `SEPOLIA_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, and `SEPOLIA_BENCHMARK_REFERENCE_CONTRACT_ADDRESS=0x1F14E890e7428322F25Fa6aCfD0A89C045311102` from local environment only.
- Produces: a read-only JSON preflight result and a user-approved maximum amount in wei; sends no transaction.

- [ ] **Step 1: Confirm Node and repository state without exposing secrets**

Run `node --version`, `git status --short`, and a command that prints only whether the three required variable names are set. Do not print `.env`, variable values, or shell history.

- [ ] **Step 2: Run all local verification again immediately before network access**

Run the five commands from Task 6 Step 7. Stop if any command fails.

- [ ] **Step 3: Run the read-only preflight**

Run from `contracts/`:

```bash
npm run sepolia:benchmark:preflight
```

Expected: exit 0, `transactionSent: false`, chain ID `11155111`, operation count `68`, aggregate ceiling `16500000`, matching bytecode and owner, estimates below ceilings, sufficient balance, and a concrete `boundedMaximumCostWei`.

- [ ] **Step 4: Present the exact bound and stop for user approval**

Report the current balance, fee estimate, 16.5-million-gas ceiling, exact maximum in wei and Sepolia ETH, and the estimated actual cost separately. Explicitly state that no transaction has been sent. Do not start Task 8 until the user confirms that exact maximum.

### Task 8: Execute, Validate, and Analyze the Public Experiment

**Files:**
- Create: exact raw file printed by the runner under `measurements/raw/sepolia/`.
- Create: matching processed summary under `measurements/processed/`.
- Modify only if a defect is reproduced: runner/helper/test files from Tasks 1-6, using a fresh RED-GREEN cycle.

**Interfaces:**
- Consumes: the exact user-approved maximum from Task 7 and a non-empty current code-version identifier retained only in raw metadata.
- Produces: completed or safely aborted raw artifact; a processed summary only for a completed, validated artifact.

- [ ] **Step 1: Recheck current fee and approved budget at execution start**

Run preflight again. If the new `boundedMaximumCostWei` exceeds the amount approved in Task 7, stop and request a new approval. Never raise the approved amount automatically.

- [ ] **Step 2: Start the benchmark with the exact approved wei value**

Set `SEPOLIA_BENCHMARK_MAX_COST_WEI` to the exact approved decimal value and `SEPOLIA_BENCHMARK_CODE_VERSION` to the current full commit identifier, then run from `contracts/`:

```bash
npm run sepolia:benchmark
```

Communicate progress at least once per minute during the sequential receipts. Do not start any other wallet operation concurrently.

- [ ] **Step 3: Validate completion before describing success**

Run the analyzer against the exact raw path printed by the runner and the new
Sepolia-matched Hardhat JSON. Its sibling `.sha256` must verify exact bytes.
The analyzer must reject an aborted or partial Sepolia artifact, the legacy
CSV, a broken matched topology, or a code-version mismatch. Independently
verify 68 status-one receipts, arithmetic totals, no secret keys/literals, and
two nonzero contract addresses in each environment.

- [ ] **Step 4: Cross-check cost and relevant source history**

Compare the sum of `gasUsed * effectiveGasPriceWei` with the raw total and wallet balance delta when there was no other wallet activity. Compare `contracts/contracts/ModelRegistry.sol` between the local CSV commit and the Sepolia code-version commit with `git diff --exit-code`; record whether the relevant contract source was unchanged. Do not claim bytecode identity solely from different commit identifiers.

- [ ] **Step 5: Run final local tests after analysis output is generated**

Run `npm run test:verify` and `cd contracts && npx tsc --noEmit && npm test` again. Read complete output and record actual test counts.

- [ ] **Step 6: Commit only verified benchmark artifacts**

Stage the two literal paths printed by the completed runner and analyzer; write those complete paths in the `git add --` command and verify them with `git diff --cached --name-only` before committing. Never use a wildcard or stage the whole `measurements/` directory.

```bash
git commit -m "test: record Sepolia gas latency benchmark"
```

### Task 9: Record Research Outcome and Prepare Thesis Decision

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/state.md`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/session-summary.md`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/experiment-protocol.md`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/remaining-tests-plan.md`
- Do not modify yet: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/*.tex`

**Interfaces:**
- Consumes: validated raw artifact, processed summary, final test output, and source-history comparison.
- Produces: reproducible working record and a concise proposal for whether to add a separate Sepolia paragraph/table to the thesis.

- [ ] **Step 1: Update all four working documents with facts only**

Record the dated series ID, batch size 10, `1 + 5` structure, two-contract design, exact transaction count, actual gas and fee, five measured latency values and summary method, RPC/provider limitation without URL, source-version comparison, test counts, and raw/processed paths. State explicitly that Sepolia remains separate from Hardhat and that p95 was not calculated.

- [ ] **Step 2: Scan working documents for stale or contradictory status**

Run `rg` for `Sepolia.*zablok`, `Sepolia.*niewykon`, old test counts, `p95`, and claims that public timing is universal. Resolve only contradictions caused by this experiment; preserve historical narrative where clearly dated.

- [ ] **Step 3: Prepare but do not apply a thesis-text recommendation**

Recommend either no thesis change or one separate short subsection/table based on whether Sepolia gas agrees with the local result and whether timing data are complete. Include exact proposed claims and limitations, but wait for user approval before changing any `.tex` file.

- [ ] **Step 4: Push the completed branch after verifying scope**

Run `git status --short`, `git diff --check`, `git log --oneline --decorate -5`, and confirm unrelated untracked measurement/report files remain unstaged. Push only `codex/bidsphere-thesis-final-tests` after all implementation and artifact commits are present.

- [ ] **Step 5: Deliver the handoff**

Report passed, aborted, or impossible steps exactly; list actual transaction count and cost; link raw/processed artifacts and four working documents; state whether any pending transaction remains; and ask for the separate thesis-text decision.
