import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  analyzeMatchedBenchmark,
  compareRelevantContractSource,
  summarizeFive,
  validateCompletedMatchedHardhatResult,
  validateCompletedSepoliaResult,
} from "../scripts/analyze-sepolia-benchmark.mjs";
import * as analyzerModule from "../scripts/analyze-sepolia-benchmark.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const analyzerPath = join(repositoryRoot, "scripts", "analyze-sepolia-benchmark.mjs");

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
  startedOffsetMs = index * 100,
  endToEndMs = 100,
}) {
  const broadcastOffsetMs = startedOffsetMs + 10;
  const receiptOffsetMs = startedOffsetMs + endToEndMs;
  return {
    operationId,
    kind,
    strategy,
    round,
    warmup,
    sequenceInRound,
    status: "confirmed",
    transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
    nonce: 40 + index,
    broadcastAcknowledged: true,
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
    broadcastAtUtc: new Date(index * 1000 + 10).toISOString(),
    receiptAtUtc: new Date(index * 1000 + 100).toISOString(),
    startedOffsetMs,
    broadcastOffsetMs,
    receiptOffsetMs,
    submissionMs: 10,
    confirmationMs: endToEndMs - 10,
    endToEndMs,
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
  let timingCursor = 300;

  for (let round = 0; round < 6; round += 1) {
    const gasUsed = INDIVIDUAL_ROUND_GAS[round] / 10;
    for (let sequenceInRound = 0; sequenceInRound < 10; sequenceInRound += 1) {
      const individualDuration =
        sequenceInRound === 9 ? INDIVIDUAL_ROUND_MS[round] - 900 : 100;
      transactions.push(transaction({
        operationId: `individual:${round}:${sequenceInRound}`,
        kind: "individual-registration",
        strategy: "individual",
        round,
        warmup: round === 0,
        sequenceInRound,
        gasUsed,
        index,
        startedOffsetMs: timingCursor + sequenceInRound * 100,
        endToEndMs: individualDuration,
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
    timingCursor += INDIVIDUAL_ROUND_MS[round] + 100;
    transactions.push(transaction({
      operationId: `merkle:${round}`,
      kind: "merkle-registration",
      strategy: "merkle",
      round,
      warmup: round === 0,
      sequenceInRound: 10,
      gasUsed: MERKLE_ROUND_GAS[round],
      index,
      startedOffsetMs: timingCursor,
      endToEndMs: MERKLE_ROUND_MS[round],
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
    timingCursor += MERKLE_ROUND_MS[round] + 100;
  }

  return {
    schemaVersion: 2,
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

function createMatchedRaw(codeVersion = "0123456789abcdef0123456789abcdef01234567") {
  const original = createCompletedRaw();
  const transactions = original.transactions.map((record, index) => {
    const merkle = record.kind === "merkle-registration";
    const planned = original.plannedOperations[index];
    const matched = {
      ...record,
      modelIds: [...planned.modelIds],
      merkleRoot: planned.merkleRoot,
      contractAddress: original.contractAddresses[record.strategy],
      batchCountBefore: merkle ? record.round : null,
      batchCountAfter: merkle ? record.round + 1 : null,
    };
    delete matched.nonce;
    delete matched.broadcastAcknowledged;
    delete matched.broadcastAtUtc;
    delete matched.broadcastOffsetMs;
    delete matched.submissionMs;
    delete matched.confirmationMs;
    return matched;
  });
  return {
    schemaVersion: 2,
    kind: "hardhat-sepolia-matched",
    status: "completed",
    seriesId: original.seriesId,
    startedAtUtc: original.startedAtUtc,
    completedAtUtc: original.completedAtUtc,
    network: "hardhat",
    chainId: 31337,
    codeVersion,
    topology: "one-long-lived-contract-per-strategy",
    runtime: {
      node: "v24.19.0",
      hardhat: "2.28.6",
      solidityCompiler: {
        version: "0.8.19",
        optimizerEnabled: false,
        optimizerRuns: 200,
        evmVersion: "paris",
      },
    },
    deployedBytecodeKeccak256: `0x${"ab".repeat(32)}`,
    configuration: {
      batchSize: 10,
      warmupRounds: 1,
      recordedRounds: 5,
      operationCount: 68,
    },
    contractAddresses: original.contractAddresses,
    plannedOperations: original.plannedOperations,
    transactions,
    rounds: original.rounds,
    finalMerkleBatchCount: 6,
    totalGasUsed: original.totalGasUsed,
    totalActualFeeWei: original.totalActualFeeWei,
  };
}

test("validates the matched long-lived topology and emits exact five-observation summaries", () => {
  const codeVersion = "0123456789abcdef0123456789abcdef01234567";
  const local = createMatchedRaw(codeVersion);
  validateCompletedMatchedHardhatResult(local);
  const summary = analyzeMatchedBenchmark(
    { ...createCompletedRaw(), codeVersion },
    local,
    "a".repeat(64),
    {
      codeVersionIdentifiersMatch: true,
      modelRegistrySourceUnchanged: true,
      bytecodeIdentityClaimed: false,
    }
  );

  assert.equal(summary.localReference.seriesId, local.seriesId);
  assert.equal(summary.localReference.sha256, "a".repeat(64));
  assert.equal(summary.localReference.topology, "one-long-lived-contract-per-strategy");
  assert.deepEqual(summary.individual.totalGas.observations, ["940000", "942130", "950000", "930000", "945000"]);
  assert.deepEqual(summary.individual.totalGas.statistics, {
    count: 5,
    min: "930000",
    median: "942130",
    max: "950000",
  });
  assert.deepEqual(summary.individual.gasPerModel.observations, ["94000", "94213", "95000", "93000", "94500"]);
  assert.deepEqual(summary.individual.gasPerModel.statistics, {
    count: 5,
    min: "93000",
    median: "94213",
    max: "95000",
  });
  assert.deepEqual(summary.merkle.gasPerModel.observations, ["58000", "58766.1", "59000", "57000", "60000"]);
  assert.deepEqual(summary.merkle.actualFeeWei.observations, ["1160000", "1175322", "1180000", "1140000", "1200000"]);
  assert.deepEqual(summary.merkle.actualFeeEth.observations, [
    "0.00000000000116",
    "0.000000000001175322",
    "0.00000000000118",
    "0.00000000000114",
    "0.0000000000012",
  ]);
  assert.equal(Object.hasOwn(summary, "source"), false);
  assert.equal(Object.hasOwn(summary, "localSource"), false);
  assert.equal(JSON.stringify(summary).includes(codeVersion), false);
  assert.equal(JSON.stringify(summary).includes("p95"), false);
});

test("does not export the obsolete legacy CSV cross-environment analyzer", () => {
  assert.equal(Object.hasOwn(analyzerModule, "analyzeSepoliaBenchmark"), false);
  assert.equal(Object.hasOwn(analyzerModule, "parseLocalBatchTenCsv"), false);
});

test("rejects non-matched local evidence, broken counters, and code-version mismatch", () => {
  const wrongChain = createMatchedRaw();
  wrongChain.chainId = 11155111;
  assert.throws(() => validateCompletedMatchedHardhatResult(wrongChain), /chain ID/i);

  const wrongTopology = createMatchedRaw();
  wrongTopology.topology = "fresh-contract-per-repetition";
  assert.throws(() => validateCompletedMatchedHardhatResult(wrongTopology), /storage topology/i);

  const wrongCounter = createMatchedRaw();
  wrongCounter.transactions.find((record) => record.operationId === "merkle:3").batchCountBefore = 0;
  assert.throws(() => validateCompletedMatchedHardhatResult(wrongCounter), /batch count/i);

  const wrongAddress = createMatchedRaw();
  wrongAddress.transactions.find((record) => record.operationId === "individual:1:0").contractAddress =
    wrongAddress.contractAddresses.merkle;
  assert.throws(() => validateCompletedMatchedHardhatResult(wrongAddress), /contract address/i);

  const wrongGasLimit = createMatchedRaw();
  wrongGasLimit.transactions.find((record) => record.operationId === "individual:1:0").gasLimit = "149999";
  assert.throws(() => validateCompletedMatchedHardhatResult(wrongGasLimit), /topology/i);

  const local = createMatchedRaw("1111111111111111111111111111111111111111");
  const publicRaw = { ...createCompletedRaw(), codeVersion: "2222222222222222222222222222222222222222" };
  assert.throws(
    () => analyzeMatchedBenchmark(publicRaw, local, "a".repeat(64), {
      codeVersionIdentifiersMatch: false,
      modelRegistrySourceUnchanged: true,
      bytecodeIdentityClaimed: false,
    }),
    /code version/i
  );
});

test("rejects missing or mutated matched transaction payload fields", () => {
  const mutations = [
    ["deployment model IDs", "deployment:individual", (record) => { delete record.modelIds; }],
    ["deployment Merkle root", "deployment:merkle", (record) => { record.merkleRoot = `0x${"11".repeat(32)}`; }],
    ["individual model IDs", "individual:1:0", (record) => { record.modelIds = ["f".repeat(24)]; }],
    ["individual Merkle root", "individual:1:1", (record) => { record.merkleRoot = `0x${"22".repeat(32)}`; }],
    ["Merkle model IDs", "merkle:2", (record) => { record.modelIds = record.modelIds.slice(1); }],
    ["Merkle root", "merkle:3", (record) => { delete record.merkleRoot; }],
  ];

  for (const [label, operationId, mutate] of mutations) {
    const matched = createMatchedRaw();
    const record = matched.transactions.find((candidate) => candidate.operationId === operationId);
    mutate(record);
    assert.throws(
      () => validateCompletedMatchedHardhatResult(matched),
      /payload|model IDs|Merkle root|canonical/i,
      label
    );
  }
});

test("summarizes exactly five observations without p95", () => {
  const values = [50, 10, 40, 20, 30];
  const summary = summarizeFive(values);
  assert.deepEqual(summary, { count: 5, min: 10, median: 30, max: 50 });
  assert.deepEqual(values, [50, 10, 40, 20, 30]);
  assert.equal(Object.hasOwn(summary, "p95"), false);
  assert.throws(() => summarizeFive([1, 2, 3, 4]), /exactly five/);
  assert.throws(() => summarizeFive([1, 2, 3, 4, 5, 6]), /exactly five/);
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
  assert.throws(() => validateCompletedSepoliaResult(forgedGasLimit), /gas estimate|topology/);

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

test("rejects legacy completed schema-one evidence with a diagnostic-only message", () => {
  const legacy = createCompletedRaw();
  legacy.schemaVersion = 1;
  assert.throws(
    () => validateCompletedSepoliaResult(legacy),
    /schema 1.*legacy.*diagnostic|legacy.*diagnostic.*schema 1/i
  );
});

test("rejects incomplete or inconsistent paid transaction evidence", () => {
  const mutations = [
    ["nonce", (record) => { record.nonce = 1.5; }],
    ["broadcast acknowledgement", (record) => { record.broadcastAcknowledged = false; }],
    ["broadcast timestamp", (record) => { record.broadcastAtUtc = null; }],
    ["block number", (record) => { record.blockNumber = 0; }],
    ["gas estimate", (record) => { record.gasEstimate = "150001"; }],
    ["priority fee", (record) => { record.maxPriorityFeePerGasWei = "4"; }],
    ["effective gas price", (record) => { record.effectiveGasPriceWei = "4"; }],
    ["worst-case fee", (record) => { record.worstCaseFeeWei = "1"; }],
    ["started offset", (record) => { record.startedOffsetMs = -1; }],
    ["broadcast offset", (record) => { record.broadcastOffsetMs = record.startedOffsetMs - 1; }],
    ["receipt offset", (record) => { record.receiptOffsetMs = record.broadcastOffsetMs - 1; }],
    ["submission duration", (record) => { record.submissionMs += 1; }],
    ["confirmation duration", (record) => { record.confirmationMs += 1; }],
    ["end-to-end duration", (record) => { record.endToEndMs += 1; }],
  ];

  for (const [label, mutate] of mutations) {
    const raw = createCompletedRaw();
    mutate(raw.transactions[2]);
    assert.throws(
      () => validateCompletedSepoliaResult(raw),
      new RegExp(String(label).replace("-", "[- ]"), "i"),
      label
    );
  }

  const noncontiguousNonce = createCompletedRaw();
  noncontiguousNonce.transactions[10].nonce += 5;
  assert.throws(() => validateCompletedSepoliaResult(noncontiguousNonce), /nonce.*contiguous/i);
});

test("rejects invalid paid benchmark metadata and spend beyond approval", () => {
  const mutations = [
    ["approved maximum", (raw) => { raw.configuration.approvedMaximumWei = "0"; }],
    ["approved maximum", (raw) => { raw.configuration.approvedMaximumWei = "1"; }],
    ["balance before", (raw) => { raw.balanceBeforeWei = "-1"; }],
    ["balance after", (raw) => { raw.balanceAfterWei = null; }],
    ["deployer", (raw) => { raw.deployerAddress = "0x0000000000000000000000000000000000000000"; }],
    ["runtime", (raw) => { raw.runtime.node = ""; }],
    ["runtime", (raw) => { raw.runtime.hardhat = "   "; }],
    ["provider label", (raw) => { raw.rpcProviderLabel = "https://rpc.invalid"; }],
  ];

  for (const [label, mutate] of mutations) {
    const raw = createCompletedRaw();
    mutate(raw);
    assert.throws(
      () => validateCompletedSepoliaResult(raw),
      new RegExp(label, "i"),
      label
    );
  }

  const zeroBalances = createCompletedRaw();
  zeroBalances.balanceBeforeWei = "0";
  zeroBalances.balanceAfterWei = "0";
  assert.doesNotThrow(() => validateCompletedSepoliaResult(zeroBalances));
});

test("rejects forged paid and matched round latency independently of UTC timestamps", () => {
  const paid = createCompletedRaw();
  paid.rounds[0].wallClockMs += 1;
  assert.throws(() => validateCompletedSepoliaResult(paid), /wall-clock.*offset/i);

  const matched = createMatchedRaw();
  matched.rounds[0].wallClockMs += 1;
  assert.throws(() => validateCompletedMatchedHardhatResult(matched), /wall-clock.*offset/i);

  const reversedUtc = createCompletedRaw();
  reversedUtc.transactions[2].submittedAtUtc = "2026-08-12T10:00:01.000Z";
  reversedUtc.transactions[2].broadcastAtUtc = "2026-08-12T09:59:59.000Z";
  reversedUtc.transactions[2].receiptAtUtc = "2026-08-12T09:59:58.000Z";
  assert.doesNotThrow(() => validateCompletedSepoliaResult(reversedUtc));
});

test("rejects overlapping paid and matched receipts and decreasing block order", () => {
  for (const [label, createRaw, validate] of [
    ["paid", createCompletedRaw, validateCompletedSepoliaResult],
    ["matched", createMatchedRaw, validateCompletedMatchedHardhatResult],
  ]) {
    const overlapping = createRaw();
    const record = overlapping.transactions[2];
    record.startedOffsetMs = 250;
    record.receiptOffsetMs = 350;
    record.endToEndMs = 100;
    if (label === "paid") {
      record.broadcastOffsetMs = 260;
      record.submissionMs = 10;
      record.confirmationMs = 90;
    }
    overlapping.rounds.find(
      (round) => round.strategy === "individual" && round.round === 0
    ).wallClockMs = 1050;
    assert.throws(
      () => validate(overlapping),
      /sequential.*offset|started offset.*previous receipt/i,
      `${label} overlap`
    );

    const decreasingBlock = createRaw();
    decreasingBlock.transactions[2].blockNumber =
      decreasingBlock.transactions[1].blockNumber - 1;
    assert.throws(
      () => validate(decreasingBlock),
      /block.*nondecreasing|block.*previous/i,
      `${label} block order`
    );
  }
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

test("CLI imports without side effects", () => {
  const importResult = spawnSync(process.execPath, ["--input-type=module", "--eval", `import(${JSON.stringify(pathToFileURL(analyzerPath).href)})`], { encoding: "utf8" });
  assert.equal(importResult.status, 0, importResult.stderr);
  assert.equal(importResult.stdout, "");
  assert.equal(importResult.stderr, "");

});

test("CLI accepts a matched JSON sibling digest and rejects the legacy CSV", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-matched-analysis-cli-"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Benchmark Test"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "benchmark@example.invalid"], { cwd: directory });
  const contractDirectory = join(directory, "contracts", "contracts");
  mkdirSync(contractDirectory, { recursive: true });
  writeFileSync(join(contractDirectory, "ModelRegistry.sol"), "contract ModelRegistry {}\n");
  execFileSync("git", ["add", "contracts/contracts/ModelRegistry.sol"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "matched source"], { cwd: directory });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  const publicRaw = { ...createCompletedRaw(), codeVersion: commit };
  const localRaw = createMatchedRaw(commit);
  const publicPath = join(directory, "public.json");
  const localPath = join(directory, "local.json");
  const outputPath = join(directory, "summary.json");
  const localBytes = `${JSON.stringify(localRaw)}\n`;
  writeFileSync(publicPath, JSON.stringify(publicRaw));
  writeFileSync(localPath, localBytes);
  writeFileSync(`${localPath}.sha256`, `${createHash("sha256").update(localBytes).digest("hex")}\n`);

  const accepted = spawnSync(process.execPath, [analyzerPath, publicPath, localPath, outputPath], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  const summary = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(summary.localReference.seriesId, localRaw.seriesId);
  assert.equal(Object.hasOwn(summary, "source"), false);

  const legacyCsv = "network,batch_size,gas_used\nhardhat,10,587661\n";
  writeFileSync(localPath, legacyCsv);
  writeFileSync(`${localPath}.sha256`, `${createHash("sha256").update(legacyCsv).digest("hex")}\n`);
  const legacy = spawnSync(process.execPath, [analyzerPath, publicPath, localPath, outputPath], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.notEqual(legacy.status, 0);
  assert.match(legacy.stderr, /JSON|matched/i);
});

test("CLI verifies the exact sibling digest and protects all four filesystem endpoints", () => {
  const directory = mkdtempSync(join(tmpdir(), "bidsphere-matched-analysis-digest-"));
  const publicPath = join(directory, "public.json");
  const localPath = join(directory, "local.json");
  const digestPath = `${localPath}.sha256`;
  const outputPath = join(directory, "summary.json");
  writeFileSync(publicPath, "{}\n");
  writeFileSync(localPath, "{}\n");
  writeFileSync(digestPath, `${"a".repeat(64)}\n`);

  const mismatch = spawnSync(process.execPath, [analyzerPath, publicPath, localPath, outputPath], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /SHA-256|digest/i);

  for (const protectedPath of [publicPath, localPath, digestPath]) {
    for (const makeAlias of [linkSync, symlinkSync]) {
      const aliasOutput = join(directory, `alias-${protectedPath.length}-${makeAlias.name}`);
      makeAlias(protectedPath, aliasOutput);
      const result = spawnSync(process.execPath, [analyzerPath, publicPath, localPath, aliasOutput], {
        cwd: directory,
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /distinct paths|path alias/i);
      unlinkSync(aliasOutput);
    }
  }
});
