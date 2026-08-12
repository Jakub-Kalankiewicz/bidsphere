import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  analyzeSepoliaBenchmark,
  compareRelevantContractSource,
  parseLocalBatchTenCsv,
  summarizeFive,
  validateCompletedSepoliaResult,
} from "../scripts/analyze-sepolia-benchmark.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const analyzerPath = join(repositoryRoot, "scripts", "analyze-sepolia-benchmark.mjs");

const LOCAL_CSV = `timestamp,commit,network,batch_size,repetition,individual_total_gas,merkle_batch_gas,individual_gas_per_model,merkle_gas_per_model,model_id_length
2026-01-01T00:00:01Z,local-commit,hardhat,10,1,942101,587601,94210.1,58760.1,24
2026-01-01T00:00:02Z,local-commit,hardhat,10,2,942102,587602,94210.2,58760.2,24
2026-01-01T00:00:03Z,local-commit,hardhat,10,3,942103,587603,94210.3,58760.3,24
2026-01-01T00:00:04Z,local-commit,hardhat,10,4,942104,587604,94210.4,58760.4,24
2026-01-01T00:00:05Z,local-commit,hardhat,10,5,942105,587605,94210.5,58760.5,24
2026-01-01T00:00:06Z,local-commit,hardhat,10,6,942106,587606,94210.6,58760.6,24
2026-01-01T00:00:07Z,local-commit,hardhat,10,7,942107,587607,94210.7,58760.7,24
2026-01-01T00:00:08Z,local-commit,hardhat,10,8,942108,587608,94210.8,58760.8,24
2026-01-01T00:00:09Z,local-commit,hardhat,10,9,942109,587609,94210.9,58760.9,24
2026-01-01T00:00:10Z,local-commit,hardhat,10,10,942110,587610,94211,58761,24
2026-01-01T00:00:11Z,local-commit,hardhat,10,11,942111,587611,94211.1,58761.1,24
2026-01-01T00:00:12Z,local-commit,hardhat,10,12,942112,587612,94211.2,58761.2,24
2026-01-01T00:00:13Z,local-commit,hardhat,10,13,942113,587613,94211.3,58761.3,24
2026-01-01T00:00:14Z,local-commit,hardhat,10,14,942114,587614,94211.4,58761.4,24
2026-01-01T00:00:15Z,local-commit,hardhat,10,15,942130,587661,94213,58766.1,24
2026-01-01T00:00:16Z,local-commit,hardhat,10,16,942130,587661,94213,58766.1,24
2026-01-01T00:00:17Z,local-commit,hardhat,10,17,942147,587708,94214.7,58770.8,24
2026-01-01T00:00:18Z,local-commit,hardhat,10,18,942148,587709,94214.8,58770.9,24
2026-01-01T00:00:19Z,local-commit,hardhat,10,19,942149,587710,94214.9,58771,24
2026-01-01T00:00:20Z,local-commit,hardhat,10,20,942150,587711,94215,58771.1,24
2026-01-01T00:00:21Z,local-commit,hardhat,10,21,942151,587712,94215.1,58771.2,24
2026-01-01T00:00:22Z,local-commit,hardhat,10,22,942152,587713,94215.2,58771.3,24
2026-01-01T00:00:23Z,local-commit,hardhat,10,23,942153,587714,94215.3,58771.4,24
2026-01-01T00:00:24Z,local-commit,hardhat,10,24,942154,587715,94215.4,58771.5,24
2026-01-01T00:00:25Z,local-commit,hardhat,10,25,942155,587716,94215.5,58771.6,24
2026-01-01T00:00:26Z,local-commit,hardhat,10,26,942156,587717,94215.6,58771.7,24
2026-01-01T00:00:27Z,local-commit,hardhat,10,27,942157,587718,94215.7,58771.8,24
2026-01-01T00:00:28Z,local-commit,hardhat,10,28,942158,587719,94215.8,58771.9,24
2026-01-01T00:00:29Z,local-commit,hardhat,10,29,942159,587720,94215.9,58772,24
2026-01-01T00:00:30Z,local-commit,hardhat,10,30,942160,587721,94216,58772.1,24
2026-01-01T00:00:31Z,ignored,hardhat,5,1,1,1,0.2,0.2,24
2026-01-01T00:00:32Z,ignored,sepolia,10,1,1,1,0.1,0.1,24`;

const UNREPRESENTABLE_HALF_MEDIAN_CSV = `commit,network,batch_size,individual_total_gas,merkle_batch_gas
edge-commit,hardhat,10,1,1
edge-commit,hardhat,10,2,2
edge-commit,hardhat,10,3,3
edge-commit,hardhat,10,4,4
edge-commit,hardhat,10,5,5
edge-commit,hardhat,10,6,6
edge-commit,hardhat,10,7,7
edge-commit,hardhat,10,8,8
edge-commit,hardhat,10,9,9
edge-commit,hardhat,10,10,10
edge-commit,hardhat,10,11,11
edge-commit,hardhat,10,12,12
edge-commit,hardhat,10,13,13
edge-commit,hardhat,10,14,14
edge-commit,hardhat,10,9007199254740990,9007199254740990
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991
edge-commit,hardhat,10,9007199254740991,9007199254740991`;

const INDIVIDUAL_ROUND_GAS = [900000, 940000, 942130, 950000, 930000, 945000];
const MERKLE_ROUND_GAS = [600000, 580000, 587661, 590000, 570000, 600000];
const INDIVIDUAL_ROUND_MS = [1000, 1100, 1200, 1300, 1400, 1500];
const MERKLE_ROUND_MS = [100, 110, 120, 130, 140, 150];

function modelId(seriesId, strategy, round, index) {
  return createHash("sha256")
    .update(`${seriesId}:${strategy}:${round}:${index}`)
    .digest("hex")
    .slice(0, 24);
}

function merkleRoot(seriesId, round) {
  return `0x${createHash("sha256").update(`${seriesId}:merkle:${round}`).digest("hex")}`;
}

function transaction({
  operationId,
  kind,
  strategy,
  round,
  warmup,
  sequenceInRound,
  gasUsed,
  index,
}) {
  return {
    operationId,
    kind,
    strategy,
    round,
    warmup,
    sequenceInRound,
    status: "confirmed",
    transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
    blockNumber: 1000 + index,
    receiptStatus: 1,
    confirmationsRequested: 1,
    gasEstimate: String(gasUsed),
    gasLimit: kind === "deployment" ? "1500000" : kind === "individual-registration" ? "150000" : "750000",
    gasUsed: String(gasUsed),
    maxFeePerGasWei: "3",
    maxPriorityFeePerGasWei: "1",
    effectiveGasPriceWei: "2",
    actualFeeWei: String(gasUsed * 2),
    worstCaseFeeWei: String((kind === "deployment" ? 1500000 : kind === "individual-registration" ? 150000 : 750000) * 3),
    submittedAtUtc: new Date(index * 1000).toISOString(),
    receiptAtUtc: new Date(index * 1000 + 100).toISOString(),
    submissionMs: 10,
    confirmationMs: 90,
    endToEndMs: 100,
  };
}

function createCompletedRaw() {
  const seriesId = "series-literal-analysis";
  const transactions = [
    transaction({ operationId: "deployment:individual", kind: "deployment", strategy: "individual", round: null, warmup: false, sequenceInRound: null, gasUsed: 1000000, index: 1 }),
    transaction({ operationId: "deployment:merkle", kind: "deployment", strategy: "merkle", round: null, warmup: false, sequenceInRound: null, gasUsed: 1100000, index: 2 }),
  ];
  const individualRounds = [];
  const merkleRounds = [];
  let index = 3;

  for (let round = 0; round < 6; round += 1) {
    const gasUsed = INDIVIDUAL_ROUND_GAS[round] / 10;
    for (let sequenceInRound = 0; sequenceInRound < 10; sequenceInRound += 1) {
      transactions.push(transaction({
        operationId: `individual:${round}:${sequenceInRound}`,
        kind: "individual-registration",
        strategy: "individual",
        round,
        warmup: round === 0,
        sequenceInRound,
        gasUsed,
        index,
      }));
      index += 1;
    }
    individualRounds.push({
      strategy: "individual",
      round,
      warmup: round === 0,
      transactionCount: 10,
      totalGasUsed: String(INDIVIDUAL_ROUND_GAS[round]),
      totalActualFeeWei: String(INDIVIDUAL_ROUND_GAS[round] * 2),
      wallClockMs: INDIVIDUAL_ROUND_MS[round],
    });
    transactions.push(transaction({
      operationId: `merkle:${round}`,
      kind: "merkle-registration",
      strategy: "merkle",
      round,
      warmup: round === 0,
      sequenceInRound: 10,
      gasUsed: MERKLE_ROUND_GAS[round],
      index,
    }));
    index += 1;
    merkleRounds.push({
      strategy: "merkle",
      round,
      warmup: round === 0,
      transactionCount: 1,
      totalGasUsed: String(MERKLE_ROUND_GAS[round]),
      totalActualFeeWei: String(MERKLE_ROUND_GAS[round] * 2),
      wallClockMs: MERKLE_ROUND_MS[round],
    });
  }

  return {
    schemaVersion: 1,
    seriesId,
    startedAtUtc: "2026-08-12T10:00:00.000Z",
    completedAtUtc: "2026-08-12T10:10:00.000Z",
    status: "completed",
    abortReason: null,
    network: "sepolia",
    chainId: 11155111,
    rpcProviderLabel: "literal provider",
    codeVersion: "sepolia-commit",
    deployerAddress: "0x3333333333333333333333333333333333333333",
    contractAddresses: {
      individual: "0x1111111111111111111111111111111111111111",
      merkle: "0x2222222222222222222222222222222222222222",
    },
    configuration: {
      batchSize: 10,
      warmupRounds: 1,
      recordedRounds: 5,
      receiptConfirmations: 1,
      receiptTimeoutMs: 600000,
      aggregateGasCeiling: "16500000",
      approvedMaximumWei: "50000000",
    },
    plannedOperations: transactions.map((record) => ({
      operationId: record.operationId,
      kind: record.kind,
      strategy: record.strategy,
      round: record.round,
      warmup: record.warmup,
      sequenceInRound: record.sequenceInRound,
      modelIds: record.kind === "deployment" ? [] : record.kind === "individual-registration" ? [modelId(seriesId, "individual", record.round, record.sequenceInRound)] : Array.from({ length: 10 }, (_, modelIndex) => modelId(seriesId, "merkle", record.round, modelIndex)),
      merkleRoot: record.kind === "merkle-registration" ? merkleRoot(seriesId, record.round) : null,
      gasLimit: record.gasLimit,
    })),
    transactions,
    rounds: [...individualRounds, ...merkleRounds],
    totalGasUsed: "11234791",
    totalActualFeeWei: "22469582",
    reservedPendingWei: "0",
    balanceBeforeWei: "100000000",
    balanceAfterWei: "77530418",
    runtime: { node: "v24.0.0", hardhat: "3.0.0" },
  };
}

test("summarizes exactly five observations without p95", () => {
  const values = [50, 10, 40, 20, 30];
  const summary = summarizeFive(values);
  assert.deepEqual(summary, { count: 5, min: 10, median: 30, max: 50 });
  assert.deepEqual(values, [50, 10, 40, 20, 30]);
  assert.equal(Object.hasOwn(summary, "p95"), false);
  assert.throws(() => summarizeFive([1, 2, 3, 4]), /exactly five/);
  assert.throws(() => summarizeFive([1, 2, 3, 4, 5, 6]), /exactly five/);
});

test("parses exactly thirty local Hardhat batch-ten rows by header name", () => {
  assert.deepEqual(parseLocalBatchTenCsv(LOCAL_CSV), {
    network: "hardhat",
    batchSize: 10,
    rows: 30,
    codeVersion: "local-commit",
    individualTotalGasMedian: 942130,
    merkleBatchGasMedian: 587661,
  });
  assert.throws(() => parseLocalBatchTenCsv(LOCAL_CSV.replace("hardhat,10,30", "hardhat,5,30")), /exactly 30/);
});

test("rejects an exact half-integer CSV median that Number cannot represent", () => {
  assert.throws(
    () => parseLocalBatchTenCsv(UNREPRESENTABLE_HALF_MEDIAN_CSV),
    /median.*exactly represented|exactly represent.*median/i
  );
});

test("returns an exactly representable half-integer CSV median as a number", () => {
  const representable = parseLocalBatchTenCsv(
    UNREPRESENTABLE_HALF_MEDIAN_CSV
      .replaceAll("9007199254740990", "100")
      .replaceAll("9007199254740991", "101")
  );
  assert.equal(representable.individualTotalGasMedian, 100.5);
  assert.equal(representable.merkleBatchGasMedian, 100.5);
});

test("validates raw arithmetic and excludes the warm-up from five-value summaries", () => {
  const raw = createCompletedRaw();
  const localReference = parseLocalBatchTenCsv(LOCAL_CSV);
  const sourceComparison = {
    codeVersionIdentifiersMatch: false,
    modelRegistrySourceUnchanged: true,
    bytecodeIdentityClaimed: false,
  };

  assert.doesNotThrow(() => validateCompletedSepoliaResult(raw));
  const summary = analyzeSepoliaBenchmark(raw, localReference, sourceComparison);

  assert.equal(summary.source, "sepolia-commit");
  assert.equal(summary.localSource, "local-commit");
  assert.equal(summary.seriesId, "series-literal-analysis");
  assert.equal(summary.method, "five recorded observations; median and min-max");
  assert.deepEqual(summary.individual.totalGas, { count: 5, min: 930000, median: 942130, max: 950000 });
  assert.deepEqual(summary.individual.gasPerModel, { count: 5, min: 93000, median: 94213, max: 95000 });
  assert.deepEqual(summary.individual.roundEndToEndMs, { count: 5, min: 1100, median: 1300, max: 1500 });
  assert.deepEqual(summary.individual.actualFeeWei, { count: 5, min: 1860000, median: 1884260, max: 1900000 });
  assert.deepEqual(summary.merkle.totalGas, { count: 5, min: 570000, median: 587661, max: 600000 });
  assert.deepEqual(summary.merkle.gasPerModel, { count: 5, min: 57000, median: 58766.1, max: 60000 });
  assert.deepEqual(summary.merkle.roundEndToEndMs, { count: 5, min: 110, median: 130, max: 150 });
  assert.deepEqual(summary.merkle.actualFeeWei, { count: 5, min: 1140000, median: 1175322, max: 1200000 });
  assert.deepEqual(summary.comparison, {
    sepoliaMerkleGasSavingPct: 37.62421321898252,
    localMerkleGasSavingPct: 37.62421321898252,
    individualGasDifferenceFromLocalPct: 0,
    merkleGasDifferenceFromLocalPct: 0,
  });
  assert.deepEqual(summary.sourceComparison, sourceComparison);
  assert.ok(summary.limitations.some((value) => /single batch size/i.test(value)));
  assert.ok(summary.limitations.some((value) => /five recorded/i.test(value)));
  assert.ok(summary.limitations.some((value) => /public-network/i.test(value)));
  assert.equal(JSON.stringify(summary).includes("p95"), false);
});

test("rejects receipt, topology, round, and experiment arithmetic corruption", () => {
  const failedReceipt = createCompletedRaw();
  failedReceipt.transactions[67].receiptStatus = 0;
  assert.throws(() => validateCompletedSepoliaResult(failedReceipt), /status-one/);

  const duplicateRoundOperation = createCompletedRaw();
  duplicateRoundOperation.transactions[3].sequenceInRound = 0;
  assert.throws(() => validateCompletedSepoliaResult(duplicateRoundOperation), /topology/);

  const forgedModelId = createCompletedRaw();
  forgedModelId.plannedOperations[2].modelIds = ["bogus"];
  assert.throws(() => validateCompletedSepoliaResult(forgedModelId), /topology/);

  const forgedMerkleRoot = createCompletedRaw();
  forgedMerkleRoot.plannedOperations[12].merkleRoot = "0x01";
  assert.throws(() => validateCompletedSepoliaResult(forgedMerkleRoot), /topology/);

  const forgedGasLimit = createCompletedRaw();
  forgedGasLimit.plannedOperations[0].gasLimit = "1";
  forgedGasLimit.transactions[0].gasLimit = "1";
  assert.throws(() => validateCompletedSepoliaResult(forgedGasLimit), /topology/);

  const wrongFixedConfiguration = createCompletedRaw();
  wrongFixedConfiguration.configuration.aggregateGasCeiling = "1";
  assert.throws(() => validateCompletedSepoliaResult(wrongFixedConfiguration), /configuration/);

  const wrongReceiptFee = createCompletedRaw();
  wrongReceiptFee.transactions[2].actualFeeWei = "1";
  assert.throws(() => validateCompletedSepoliaResult(wrongReceiptFee), /receipt fee/);

  const wrongRoundTotal = createCompletedRaw();
  wrongRoundTotal.rounds[1].totalGasUsed = "1";
  assert.throws(() => validateCompletedSepoliaResult(wrongRoundTotal), /round gas/);

  const wrongExperimentTotal = createCompletedRaw();
  wrongExperimentTotal.totalActualFeeWei = "1";
  assert.throws(() => validateCompletedSepoliaResult(wrongExperimentTotal), /experiment fee/);
});

test("distinguishes unchanged source, a real diff, and git command errors", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-source-comparison-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Benchmark Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "benchmark@example.invalid"], { cwd: directory });

  const contractDirectory = join(directory, "contracts", "contracts");
  mkdirSync(contractDirectory, { recursive: true });
  writeFileSync(join(contractDirectory, "ModelRegistry.sol"), "contract ModelRegistry {}\n");
  execFileSync("git", ["add", "contracts/contracts/ModelRegistry.sol"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "initial"], { cwd: directory });
  const first = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();

  writeFileSync(join(directory, "README.md"), "unrelated\n");
  execFileSync("git", ["add", "README.md"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "unrelated"], { cwd: directory });
  const second = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();

  assert.deepEqual(compareRelevantContractSource(directory, first, first), {
    codeVersionIdentifiersMatch: true,
    modelRegistrySourceUnchanged: true,
    bytecodeIdentityClaimed: false,
  });
  assert.deepEqual(compareRelevantContractSource(directory, first, second), {
    codeVersionIdentifiersMatch: false,
    modelRegistrySourceUnchanged: true,
    bytecodeIdentityClaimed: false,
  });

  writeFileSync(join(contractDirectory, "ModelRegistry.sol"), "contract ModelRegistry { uint value; }\n");
  execFileSync("git", ["add", "contracts/contracts/ModelRegistry.sol"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "contract change"], { cwd: directory });
  const third = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  assert.deepEqual(compareRelevantContractSource(directory, first, third), {
    codeVersionIdentifiersMatch: false,
    modelRegistrySourceUnchanged: false,
    bytecodeIdentityClaimed: false,
  });
  assert.throws(
    () => compareRelevantContractSource(directory, first, "0000000000000000000000000000000000000000"),
    /commit object/i
  );
});

test("rejects option-like code versions without creating an attacker-selected file", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-source-option-create-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Benchmark Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "benchmark@example.invalid"], { cwd: directory });
  writeFileSync(join(directory, "tracked.txt"), "tracked\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "initial"], { cwd: directory });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  const injectedOutput = join(directory, "must-not-exist.txt");

  assert.throws(
    () => compareRelevantContractSource(directory, `--output=${injectedOutput}`, commit),
    /full 40-character hexadecimal commit/i
  );
  assert.equal(existsSync(injectedOutput), false);
});

test("rejects option-like code versions without truncating an existing file", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-source-option-truncate-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Benchmark Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "benchmark@example.invalid"], { cwd: directory });
  writeFileSync(join(directory, "tracked.txt"), "tracked\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "initial"], { cwd: directory });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  const injectedOutput = join(directory, "must-remain.txt");
  const sentinel = "do not truncate this file\n";
  writeFileSync(injectedOutput, sentinel);

  assert.throws(
    () => compareRelevantContractSource(directory, commit, `--output=${injectedOutput}`),
    /full 40-character hexadecimal commit/i
  );
  assert.equal(readFileSync(injectedOutput, "utf8"), sentinel);
});

test("rejects abbreviated identifiers and Git objects that are not commits", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-source-object-type-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Benchmark Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "benchmark@example.invalid"], { cwd: directory });
  const trackedPath = join(directory, "tracked.txt");
  writeFileSync(trackedPath, "tracked\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "initial"], { cwd: directory });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  const blob = execFileSync("git", ["hash-object", "-w", "tracked.txt"], {
    cwd: directory,
    encoding: "utf8",
  }).trim();

  assert.throws(
    () => compareRelevantContractSource(directory, commit.slice(0, 12), commit),
    /full 40-character hexadecimal commit/i
  );
  assert.throws(
    () => compareRelevantContractSource(directory, blob, commit),
    /commit object/i
  );
});

test("rejects an annotated-tag object even when it peels to a commit", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-source-tag-object-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Benchmark Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "benchmark@example.invalid"], { cwd: directory });
  writeFileSync(join(directory, "tracked.txt"), "tracked\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "initial"], { cwd: directory });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  execFileSync("git", ["tag", "-a", "benchmark-tag", "-m", "annotated benchmark tag"], { cwd: directory });
  const tagObject = execFileSync("git", ["rev-parse", "benchmark-tag"], {
    cwd: directory,
    encoding: "utf8",
  }).trim();

  assert.throws(
    () => compareRelevantContractSource(directory, tagObject, commit),
    /commit object/i
  );
});

test("CLI rejects any argument count other than exactly three paths", () => {
  for (const args of [[], ["one", "two"], ["one", "two", "three", "four"]]) {
    const result = spawnSync(process.execPath, [analyzerPath, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly three paths/i);
  }
});

test("CLI rejects resolved and symlink output aliases before reading or writing sources", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-analysis-alias-"));
  const rawPath = join(directory, "raw.json");
  const csvPath = join(directory, "local.csv");
  const symlinkPath = join(directory, "raw-alias.json");
  const rawBytes = "immutable raw benchmark bytes\n";
  const csvBytes = "immutable local CSV bytes\n";
  writeFileSync(rawPath, rawBytes);
  writeFileSync(csvPath, csvBytes);
  symlinkSync(rawPath, symlinkPath);

  for (const outputPath of [rawPath, csvPath, symlinkPath]) {
    const result = spawnSync(process.execPath, [analyzerPath, rawPath, csvPath, outputPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /three distinct paths|path alias/i);
    assert.equal(readFileSync(rawPath, "utf8"), rawBytes);
    assert.equal(readFileSync(csvPath, "utf8"), csvBytes);
  }
});

test("CLI rejects raw and CSV hard-link outputs before reading or writing sources", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-analysis-hard-link-"));
  const rawPath = join(directory, "raw.json");
  const csvPath = join(directory, "local.csv");
  const outputPath = join(directory, "summary.json");
  const rawBytes = "immutable raw hard-link bytes\n";
  const csvBytes = "immutable CSV hard-link bytes\n";
  writeFileSync(rawPath, rawBytes);
  writeFileSync(csvPath, csvBytes);

  for (const sourcePath of [rawPath, csvPath]) {
    linkSync(sourcePath, outputPath);
    const result = spawnSync(process.execPath, [analyzerPath, rawPath, csvPath, outputPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /three distinct paths|path alias/i);
    assert.equal(readFileSync(rawPath, "utf8"), rawBytes);
    assert.equal(readFileSync(csvPath, "utf8"), csvBytes);
    unlinkSync(outputPath);
  }
});

test("CLI imports without side effects and writes a summary to a new nested directory", () => {
  const importResult = spawnSync(process.execPath, ["--input-type=module", "--eval", `import(${JSON.stringify(pathToFileURL(analyzerPath).href)})`], { encoding: "utf8" });
  assert.equal(importResult.status, 0, importResult.stderr);
  assert.equal(importResult.stdout, "");
  assert.equal(importResult.stderr, "");

  const directory = mkdtempSync(join(tmpdir(), "bidsphere-analysis-cli-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Benchmark Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "benchmark@example.invalid"], { cwd: directory });
  const contractDirectory = join(directory, "contracts", "contracts");
  mkdirSync(contractDirectory, { recursive: true });
  writeFileSync(join(contractDirectory, "ModelRegistry.sol"), "contract ModelRegistry {}\n");
  execFileSync("git", ["add", "contracts/contracts/ModelRegistry.sol"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "local source"], { cwd: directory });
  const localCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  writeFileSync(join(directory, "README.md"), "Sepolia series metadata\n");
  execFileSync("git", ["add", "README.md"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "Sepolia version"], { cwd: directory });
  const sepoliaCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();

  const raw = { ...createCompletedRaw(), codeVersion: sepoliaCommit };
  const rawPath = join(directory, "raw.json");
  const csvPath = join(directory, "local.csv");
  const outputPath = join(directory, "measurements", "processed", "summary.json");
  writeFileSync(rawPath, JSON.stringify(raw));
  writeFileSync(csvPath, LOCAL_CSV.replaceAll("local-commit", localCommit));

  const result = spawnSync(process.execPath, [analyzerPath, rawPath, csvPath, outputPath], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(outputPath), true);
  const summary = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(summary.source, sepoliaCommit);
  assert.equal(summary.localSource, localCommit);
  assert.equal(JSON.stringify(summary).includes("p95"), false);
});
