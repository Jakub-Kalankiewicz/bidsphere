import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_BATCH_SIZE = 10;
const EXPECTED_WARMUP_ROUNDS = 1;
const EXPECTED_RECORDED_ROUNDS = 5;
const EXPECTED_TOTAL_ROUNDS = 6;
const EXPECTED_TRANSACTION_COUNT = 68;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const FULL_COMMIT_PATTERN = /^[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function fail(message) {
  throw new Error(`Invalid completed Sepolia benchmark: ${message}`);
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function requireDecimal(value, label, { allowZero = false } = {}) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    fail(`${label} must be a decimal string`);
  }
  const parsed = BigInt(value);
  if (allowZero ? parsed < 0n : parsed <= 0n) {
    fail(`${label} must be ${allowZero ? "non-negative" : "positive"}`);
  }
  return parsed;
}

function requireTimestamp(value, label, invalid = fail) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    invalid(`${label} must be a valid UTC timestamp`);
  }
}

function requireFiniteNonNegative(value, label, invalid = fail) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(`${label} must be a finite non-negative number`);
  }
  return value;
}

function requireSafeNumber(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    fail(`${label} exceeds the safe numeric summary range`);
  }
  return number;
}

function requireCanonicalSequentialReceipt(
  { startedOffsetMs, receiptOffsetMs, blockNumber },
  previous,
  invalid
) {
  if (
    previous !== null &&
    startedOffsetMs < previous.receiptOffsetMs
  ) {
    invalid("transaction records must have sequential non-overlapping offsets in canonical order");
  }
  if (previous !== null && blockNumber < previous.blockNumber) {
    invalid("receipt block numbers must be nondecreasing in canonical order");
  }
  return { receiptOffsetMs, blockNumber };
}

function expectedTransactionKey(record, invalid = fail) {
  if (record.kind === "deployment") {
    if (
      (record.strategy !== "individual" && record.strategy !== "merkle") ||
      record.round !== null ||
      record.warmup !== false ||
      record.sequenceInRound !== null ||
      record.operationId !== `deployment:${record.strategy}`
    ) {
      invalid("transaction topology does not match the two deployments");
    }
    return record.operationId;
  }

  if (!Number.isInteger(record.round) || record.round < 0 || record.round >= 6) {
    invalid("transaction topology has an invalid round");
  }
  if (record.warmup !== (record.round === 0)) {
    invalid("transaction topology has an invalid warm-up marker");
  }

  if (record.kind === "individual-registration") {
    if (
      record.strategy !== "individual" ||
      !Number.isInteger(record.sequenceInRound) ||
      record.sequenceInRound < 0 ||
      record.sequenceInRound >= 10 ||
      record.operationId !== `individual:${record.round}:${record.sequenceInRound}`
    ) {
      invalid("individual transaction topology is invalid");
    }
    return record.operationId;
  }

  if (record.kind === "merkle-registration") {
    if (
      record.strategy !== "merkle" ||
      record.sequenceInRound !== 10 ||
      record.operationId !== `merkle:${record.round}`
    ) {
      invalid("Merkle transaction topology is invalid");
    }
    return record.operationId;
  }

  invalid("transaction topology contains an unknown operation kind");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function buildCanonicalOperations(seriesId) {
  const operations = [
    { operationId: "deployment:individual", kind: "deployment", strategy: "individual", round: null, warmup: false, sequenceInRound: null, modelIds: [], merkleRoot: null, gasLimit: "1500000" },
    { operationId: "deployment:merkle", kind: "deployment", strategy: "merkle", round: null, warmup: false, sequenceInRound: null, modelIds: [], merkleRoot: null, gasLimit: "1500000" },
  ];
  for (let round = 0; round < EXPECTED_TOTAL_ROUNDS; round += 1) {
    const warmup = round === 0;
    for (let sequenceInRound = 0; sequenceInRound < EXPECTED_BATCH_SIZE; sequenceInRound += 1) {
      operations.push({
        operationId: `individual:${round}:${sequenceInRound}`,
        kind: "individual-registration",
        strategy: "individual",
        round,
        warmup,
        sequenceInRound,
        modelIds: [sha256(`${seriesId}:individual:${round}:${sequenceInRound}`).slice(0, 24)],
        merkleRoot: null,
        gasLimit: "150000",
      });
    }
    operations.push({
      operationId: `merkle:${round}`,
      kind: "merkle-registration",
      strategy: "merkle",
      round,
      warmup,
      sequenceInRound: EXPECTED_BATCH_SIZE,
      modelIds: Array.from(
        { length: EXPECTED_BATCH_SIZE },
        (_, index) => sha256(`${seriesId}:merkle:${round}:${index}`).slice(0, 24)
      ),
      merkleRoot: `0x${sha256(`${seriesId}:merkle:${round}`)}`,
      gasLimit: "750000",
    });
  }
  return operations;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validatePlannedOperations(raw, invalid = fail) {
  if (!Array.isArray(raw.plannedOperations) || raw.plannedOperations.length !== 68) {
    invalid("planned-operation topology must contain exactly 68 operations");
  }
  const canonicalOperations = buildCanonicalOperations(raw.seriesId);
  for (const [index, operationValue] of raw.plannedOperations.entries()) {
    const operation = requireObject(operationValue, "planned operation");
    const canonical = canonicalOperations[index];
    const record = raw.transactions[index];
    if (
      operation.operationId !== canonical.operationId ||
      operation.kind !== canonical.kind ||
      operation.strategy !== canonical.strategy ||
      operation.round !== canonical.round ||
      operation.warmup !== canonical.warmup ||
      operation.sequenceInRound !== canonical.sequenceInRound ||
      operation.merkleRoot !== canonical.merkleRoot ||
      operation.gasLimit !== canonical.gasLimit ||
      !Array.isArray(operation.modelIds) ||
      !sameStrings(operation.modelIds, canonical.modelIds) ||
      record.operationId !== canonical.operationId ||
      record.kind !== canonical.kind ||
      record.strategy !== canonical.strategy ||
      record.round !== canonical.round ||
      record.warmup !== canonical.warmup ||
      record.sequenceInRound !== canonical.sequenceInRound ||
      record.gasLimit !== canonical.gasLimit
    ) {
      invalid("planned-operation topology does not match the canonical benchmark plan");
    }
  }
}

function validateMatchedTransactionPayloads(raw, invalid) {
  const canonicalOperations = buildCanonicalOperations(raw.seriesId);
  for (const [index, canonical] of canonicalOperations.entries()) {
    const record = raw.transactions[index];
    if (
      !Array.isArray(record.modelIds) ||
      !sameStrings(record.modelIds, canonical.modelIds) ||
      record.merkleRoot !== canonical.merkleRoot
    ) {
      invalid("matched transaction payload does not match the canonical benchmark plan");
    }
  }
}

export function summarizeFive(values) {
  if (!Array.isArray(values) || values.length !== 5) {
    throw new Error("Expected exactly five observations");
  }
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Five-value summaries require finite numeric observations");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return { count: 5, min: sorted[0], median: sorted[2], max: sorted[4] };
}

export function validateCompletedSepoliaResult(rawValue) {
  const raw = requireObject(rawValue, "raw result");
  if (raw.schemaVersion === 1) {
    fail("schema 1 is legacy diagnostic evidence and cannot be analyzed as a completed benchmark");
  }
  if (raw.schemaVersion !== 2) fail("schema version must be 2");
  if (raw.network !== "sepolia") fail('network must be "sepolia"');
  if (raw.chainId !== 11155111) fail("chain ID must be 11155111");
  if (raw.status !== "completed" || raw.abortReason !== null) {
    fail("status must be completed without an abort reason");
  }
  if (typeof raw.seriesId !== "string" || raw.seriesId.length === 0) fail("series ID is required");
  if (typeof raw.codeVersion !== "string" || raw.codeVersion.length === 0) fail("code version is required");
  requireTimestamp(raw.startedAtUtc, "start timestamp");
  requireTimestamp(raw.completedAtUtc, "completion timestamp");

  const configuration = requireObject(raw.configuration, "configuration");
  if (
    configuration.batchSize !== EXPECTED_BATCH_SIZE ||
    configuration.warmupRounds !== EXPECTED_WARMUP_ROUNDS ||
    configuration.recordedRounds !== EXPECTED_RECORDED_ROUNDS ||
    configuration.receiptConfirmations !== 1 ||
    configuration.receiptTimeoutMs !== 600000 ||
    configuration.aggregateGasCeiling !== "16500000"
  ) {
    fail("configuration must match the fixed batch, round, confirmation, timeout, and gas-ceiling values");
  }
  const approvedMaximum = requireDecimal(
    configuration.approvedMaximumWei,
    "configuration approved maximum"
  );

  if (
    typeof raw.deployerAddress !== "string" ||
    !ADDRESS_PATTERN.test(raw.deployerAddress) ||
    raw.deployerAddress.toLowerCase() === ZERO_ADDRESS
  ) {
    fail("deployer address must be valid and nonzero");
  }
  if (
    raw.rpcProviderLabel !== null &&
    (
      typeof raw.rpcProviderLabel !== "string" ||
      raw.rpcProviderLabel !== raw.rpcProviderLabel.trim() ||
      !/^[A-Za-z0-9 ._-]{1,80}$/.test(raw.rpcProviderLabel)
    )
  ) {
    fail("RPC provider label must be null or a plain safe label");
  }
  const runtime = requireObject(raw.runtime, "runtime");
  if (
    typeof runtime.node !== "string" || runtime.node.trim().length === 0 ||
    typeof runtime.hardhat !== "string" || runtime.hardhat.trim().length === 0
  ) {
    fail("runtime node and Hardhat versions must be non-empty strings");
  }
  requireDecimal(raw.balanceBeforeWei, "balance before", { allowZero: true });
  requireDecimal(raw.balanceAfterWei, "balance after", { allowZero: true });

  const addresses = requireObject(raw.contractAddresses, "contract addresses");
  if (
    typeof addresses.individual !== "string" ||
    typeof addresses.merkle !== "string" ||
    !ADDRESS_PATTERN.test(addresses.individual) ||
    !ADDRESS_PATTERN.test(addresses.merkle) ||
    addresses.individual.toLowerCase() === ZERO_ADDRESS ||
    addresses.merkle.toLowerCase() === ZERO_ADDRESS ||
    addresses.individual.toLowerCase() === addresses.merkle.toLowerCase()
  ) {
    fail("two valid, nonzero, distinct contract addresses are required");
  }

  if (!Array.isArray(raw.transactions) || raw.transactions.length !== EXPECTED_TRANSACTION_COUNT) {
    fail("exactly 68 confirmed status-one transactions are required");
  }

  let experimentGas = 0n;
  let experimentFee = 0n;
  const operationIds = new Set();
  const transactionHashes = new Set();
  let firstNonce = null;
  let previousReceipt = null;

  for (const [index, transactionValue] of raw.transactions.entries()) {
    const record = requireObject(transactionValue, "transaction record");
    if (record.status !== "confirmed" || record.receiptStatus !== 1) {
      fail("exactly 68 confirmed status-one transactions are required");
    }
    if (record.confirmationsRequested !== 1) fail("transaction confirmation topology is invalid");
    const operationId = expectedTransactionKey(record);
    if (operationIds.has(operationId)) fail("transaction topology contains a duplicate operation");
    if (!/^0x[0-9a-fA-F]{64}$/.test(record.transactionHash) || transactionHashes.has(record.transactionHash.toLowerCase())) {
      fail("transaction topology contains a duplicate or missing hash");
    }
    operationIds.add(operationId);
    transactionHashes.add(record.transactionHash.toLowerCase());

    if (!Number.isSafeInteger(record.nonce) || record.nonce < 0) {
      fail(`${operationId} nonce must be a safe non-negative integer`);
    }
    if (firstNonce === null) firstNonce = record.nonce;
    if (record.nonce !== firstNonce + index) {
      fail("transaction nonces must be contiguous in canonical operation order");
    }
    if (record.broadcastAcknowledged !== true) {
      fail(`${operationId} broadcast acknowledgement must be true`);
    }
    if (!Number.isSafeInteger(record.blockNumber) || record.blockNumber <= 0) {
      fail(`${operationId} block number must be a positive safe integer`);
    }
    requireTimestamp(record.submittedAtUtc, `${operationId} submission timestamp`);
    requireTimestamp(record.broadcastAtUtc, `${operationId} broadcast timestamp`);
    requireTimestamp(record.receiptAtUtc, `${operationId} receipt timestamp`);

    const gasEstimate = requireDecimal(record.gasEstimate, `${operationId} gas estimate`);
    const gasLimit = requireDecimal(record.gasLimit, `${operationId} gas limit`);
    const gasUsed = requireDecimal(record.gasUsed, `${operationId} gas used`);
    const maxFee = requireDecimal(record.maxFeePerGasWei, `${operationId} maximum fee per gas`);
    const priorityFee = requireDecimal(record.maxPriorityFeePerGasWei, `${operationId} priority fee`, { allowZero: true });
    const effectiveGasPrice = requireDecimal(record.effectiveGasPriceWei, `${operationId} effective gas price`);
    const actualFee = requireDecimal(record.actualFeeWei, `${operationId} actual fee`);
    const worstCaseFee = requireDecimal(record.worstCaseFeeWei, `${operationId} worst-case fee`);
    if (gasEstimate > gasLimit) fail(`${operationId} gas estimate exceeds gas limit`);
    if (gasUsed > gasLimit) fail(`${operationId} gas used exceeds gas limit`);
    if (priorityFee > maxFee) fail(`${operationId} priority fee exceeds maximum fee`);
    if (effectiveGasPrice > maxFee) fail(`${operationId} effective gas price exceeds maximum fee`);
    if (gasUsed * effectiveGasPrice !== actualFee) {
      fail(`${operationId} receipt fee does not equal gas used times effective gas price`);
    }
    if (gasLimit * maxFee !== worstCaseFee) {
      fail(`${operationId} worst-case fee does not equal gas limit times maximum fee`);
    }
    const startedOffset = requireFiniteNonNegative(record.startedOffsetMs, `${operationId} started offset`);
    const broadcastOffset = requireFiniteNonNegative(record.broadcastOffsetMs, `${operationId} broadcast offset`);
    const receiptOffset = requireFiniteNonNegative(record.receiptOffsetMs, `${operationId} receipt offset`);
    if (broadcastOffset < startedOffset) fail(`${operationId} broadcast offset precedes started offset`);
    if (receiptOffset < broadcastOffset) fail(`${operationId} receipt offset precedes broadcast offset`);
    const submission = requireFiniteNonNegative(record.submissionMs, `${operationId} submission duration`);
    const confirmation = requireFiniteNonNegative(record.confirmationMs, `${operationId} confirmation duration`);
    const endToEnd = requireFiniteNonNegative(record.endToEndMs, `${operationId} end-to-end duration`);
    if (submission !== broadcastOffset - startedOffset) fail(`${operationId} submission duration does not match offsets`);
    if (confirmation !== receiptOffset - broadcastOffset) fail(`${operationId} confirmation duration does not match offsets`);
    if (endToEnd !== receiptOffset - startedOffset) fail(`${operationId} end-to-end duration does not match offsets`);
    previousReceipt = requireCanonicalSequentialReceipt(
      {
        startedOffsetMs: startedOffset,
        receiptOffsetMs: receiptOffset,
        blockNumber: record.blockNumber,
      },
      previousReceipt,
      fail
    );
    experimentGas += gasUsed;
    experimentFee += actualFee;
  }

  validatePlannedOperations(raw);

  if (!Array.isArray(raw.rounds) || raw.rounds.length !== 12) {
    fail("round topology must contain exactly twelve aggregates");
  }
  const roundKeys = new Set();
  for (const aggregateValue of raw.rounds) {
    const aggregate = requireObject(aggregateValue, "round aggregate");
    if (
      (aggregate.strategy !== "individual" && aggregate.strategy !== "merkle") ||
      !Number.isInteger(aggregate.round) ||
      aggregate.round < 0 ||
      aggregate.round >= EXPECTED_TOTAL_ROUNDS ||
      aggregate.warmup !== (aggregate.round === 0)
    ) {
      fail("round topology is invalid");
    }
    const key = `${aggregate.strategy}:${aggregate.round}`;
    if (roundKeys.has(key)) fail("round topology contains a duplicate aggregate");
    roundKeys.add(key);
    const records = raw.transactions.filter(
      (record) => record.strategy === aggregate.strategy && record.round === aggregate.round
    );
    const expectedCount = aggregate.strategy === "individual" ? 10 : 1;
    if (records.length !== expectedCount || aggregate.transactionCount !== expectedCount) {
      fail("round topology contains the wrong transaction count");
    }
    const derivedGas = records.reduce((sum, record) => sum + BigInt(record.gasUsed), 0n);
    const derivedFee = records.reduce((sum, record) => sum + BigInt(record.actualFeeWei), 0n);
    if (requireDecimal(aggregate.totalGasUsed, `${key} round gas`) !== derivedGas) {
      fail(`${key} round gas does not agree with receipts`);
    }
    if (requireDecimal(aggregate.totalActualFeeWei, `${key} round fee`) !== derivedFee) {
      fail(`${key} round fee does not agree with receipts`);
    }
    const wallClock = requireFiniteNonNegative(aggregate.wallClockMs, `${key} round wall-clock duration`);
    const derivedWallClock =
      Math.max(...records.map((record) => record.receiptOffsetMs)) -
      Math.min(...records.map((record) => record.startedOffsetMs));
    if (wallClock !== derivedWallClock) {
      fail(`${key} round wall-clock duration does not match monotonic offsets`);
    }
  }
  for (const strategy of ["individual", "merkle"]) {
    for (let round = 0; round < EXPECTED_TOTAL_ROUNDS; round += 1) {
      if (!roundKeys.has(`${strategy}:${round}`)) fail("round topology is incomplete");
    }
  }

  if (requireDecimal(raw.totalGasUsed, "experiment gas") !== experimentGas) {
    fail("experiment gas does not agree with receipts");
  }
  if (requireDecimal(raw.totalActualFeeWei, "experiment fee") !== experimentFee) {
    fail("experiment fee does not agree with receipts");
  }
  if (experimentFee > approvedMaximum) {
    fail("experiment fee exceeds the approved maximum");
  }
  if (requireDecimal(raw.reservedPendingWei, "reserved pending fee", { allowZero: true }) !== 0n) {
    fail("a completed experiment cannot retain a pending fee reservation");
  }
}

function assertPublicMatchedMetadata(value, path = "local artifact") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicMatchedMetadata(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && /https?:\/\//i.test(value)) {
      throw new Error(`Invalid matched Hardhat benchmark: ${path} contains a URL`);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:private.?key|rpc.?url|secret|password|cookie|access.?token)/i.test(key)) {
      throw new Error(`Invalid matched Hardhat benchmark: ${path}.${key} is secret-shaped metadata`);
    }
    assertPublicMatchedMetadata(nested, `${path}.${key}`);
  }
}

export function validateCompletedMatchedHardhatResult(rawValue) {
  const raw = requireObject(rawValue, "matched Hardhat result");
  const matchedFail = (message) => {
    throw new Error(`Invalid matched Hardhat benchmark: ${message}`);
  };
  if (
    raw.schemaVersion !== 2 ||
    raw.kind !== "hardhat-sepolia-matched" ||
    raw.status !== "completed"
  ) {
    matchedFail("schema, kind, and status must identify a completed matched reference");
  }
  if (raw.network !== "hardhat") matchedFail('network must be "hardhat"');
  if (raw.chainId !== 31337) matchedFail("chain ID must be 31337");
  if (raw.topology !== "one-long-lived-contract-per-strategy") {
    matchedFail("storage topology must use one long-lived contract per strategy");
  }
  if (typeof raw.codeVersion !== "string" || !FULL_COMMIT_PATTERN.test(raw.codeVersion)) {
    matchedFail("code version must be a full 40-character hexadecimal commit identifier");
  }
  if (
    typeof raw.seriesId !== "string" || raw.seriesId.length === 0 ||
    typeof raw.startedAtUtc !== "string" || Number.isNaN(Date.parse(raw.startedAtUtc)) ||
    typeof raw.completedAtUtc !== "string" || Number.isNaN(Date.parse(raw.completedAtUtc))
  ) {
    matchedFail("series and UTC timestamps are required");
  }
  const runtime = requireObject(raw.runtime, "matched runtime");
  const compiler = requireObject(runtime.solidityCompiler, "matched compiler settings");
  if (
    typeof runtime.node !== "string" || typeof runtime.hardhat !== "string" ||
    compiler.version !== "0.8.19" || compiler.optimizerEnabled !== false ||
    compiler.optimizerRuns !== 200 || compiler.evmVersion !== "paris"
  ) {
    matchedFail("runtime and compiler settings are invalid");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw.deployedBytecodeKeccak256)) {
    matchedFail("deployed bytecode keccak must be recorded");
  }
  const configuration = requireObject(raw.configuration, "matched configuration");
  if (
    configuration.batchSize !== 10 || configuration.warmupRounds !== 1 ||
    configuration.recordedRounds !== 5 || configuration.operationCount !== 68
  ) {
    matchedFail("configuration must describe batch 10, one warm-up, five recorded rounds, and 68 operations");
  }
  const addresses = requireObject(raw.contractAddresses, "matched contract addresses");
  if (
    typeof addresses.individual !== "string" || typeof addresses.merkle !== "string" ||
    !ADDRESS_PATTERN.test(addresses.individual) || !ADDRESS_PATTERN.test(addresses.merkle) ||
    addresses.individual.toLowerCase() === ZERO_ADDRESS ||
    addresses.merkle.toLowerCase() === ZERO_ADDRESS ||
    addresses.individual.toLowerCase() === addresses.merkle.toLowerCase()
  ) matchedFail("two valid, nonzero, distinct contract addresses are required");

  if (!Array.isArray(raw.transactions) || raw.transactions.length !== EXPECTED_TRANSACTION_COUNT) {
    matchedFail("exactly 68 confirmed status-one transactions are required");
  }
  const operationIds = new Set();
  const transactionHashes = new Set();
  let experimentGas = 0n;
  let experimentFee = 0n;
  let previousReceipt = null;
  for (const recordValue of raw.transactions) {
    const record = requireObject(recordValue, "matched transaction record");
    if (record.status !== "confirmed" || record.receiptStatus !== 1 || record.confirmationsRequested !== 1) {
      matchedFail("exactly 68 confirmed status-one transactions are required");
    }
    const operationId = expectedTransactionKey(record, matchedFail);
    if (operationIds.has(operationId)) matchedFail("transaction topology contains a duplicate operation");
    if (!/^0x[0-9a-fA-F]{64}$/.test(record.transactionHash) || transactionHashes.has(record.transactionHash.toLowerCase())) {
      matchedFail("transaction topology contains a duplicate or missing hash");
    }
    operationIds.add(operationId);
    transactionHashes.add(record.transactionHash.toLowerCase());
    if (!Number.isSafeInteger(record.blockNumber) || record.blockNumber <= 0) {
      matchedFail(`${operationId} block number must be a positive safe integer`);
    }
    requireTimestamp(record.submittedAtUtc, `${operationId} submission timestamp`, matchedFail);
    requireTimestamp(record.receiptAtUtc, `${operationId} receipt timestamp`, matchedFail);
    const gasLimit = requireDecimal(record.gasLimit, `${operationId} gas limit`);
    const gasUsed = requireDecimal(record.gasUsed, `${operationId} gas used`);
    const effectiveGasPrice = requireDecimal(record.effectiveGasPriceWei, `${operationId} effective gas price`);
    const actualFee = requireDecimal(record.actualFeeWei, `${operationId} actual fee`);
    if (gasUsed > gasLimit) matchedFail(`${operationId} gas used exceeds gas limit`);
    if (gasUsed * effectiveGasPrice !== actualFee) {
      matchedFail(`${operationId} receipt fee does not equal gas used times effective gas price`);
    }
    const startedOffset = requireFiniteNonNegative(record.startedOffsetMs, `${operationId} started offset`, matchedFail);
    const receiptOffset = requireFiniteNonNegative(record.receiptOffsetMs, `${operationId} receipt offset`, matchedFail);
    const endToEnd = requireFiniteNonNegative(record.endToEndMs, `${operationId} end-to-end duration`, matchedFail);
    if (receiptOffset < startedOffset) matchedFail(`${operationId} receipt offset precedes started offset`);
    if (endToEnd !== receiptOffset - startedOffset) {
      matchedFail(`${operationId} end-to-end duration does not match offsets`);
    }
    previousReceipt = requireCanonicalSequentialReceipt(
      {
        startedOffsetMs: startedOffset,
        receiptOffsetMs: receiptOffset,
        blockNumber: record.blockNumber,
      },
      previousReceipt,
      matchedFail
    );
    const expectedAddress = raw.contractAddresses[record.strategy];
    if (
      typeof record.contractAddress !== "string" ||
      !ADDRESS_PATTERN.test(record.contractAddress) ||
      record.contractAddress.toLowerCase() !== expectedAddress.toLowerCase()
    ) {
      matchedFail("every transaction must identify its strategy contract address");
    }
    experimentGas += gasUsed;
    experimentFee += actualFee;
  }
  validatePlannedOperations(raw, matchedFail);
  validateMatchedTransactionPayloads(raw, matchedFail);

  if (!Array.isArray(raw.rounds) || raw.rounds.length !== 12) {
    matchedFail("round topology must contain exactly twelve aggregates");
  }
  const roundKeys = new Set();
  for (const aggregate of raw.rounds) {
    if (
      (aggregate.strategy !== "individual" && aggregate.strategy !== "merkle") ||
      !Number.isInteger(aggregate.round) || aggregate.round < 0 || aggregate.round >= 6 ||
      aggregate.warmup !== (aggregate.round === 0)
    ) matchedFail("round topology is invalid");
    const key = `${aggregate.strategy}:${aggregate.round}`;
    if (roundKeys.has(key)) matchedFail("round topology contains a duplicate aggregate");
    roundKeys.add(key);
    const records = raw.transactions.filter(
      (record) => record.strategy === aggregate.strategy && record.round === aggregate.round
    );
    const expectedCount = aggregate.strategy === "individual" ? 10 : 1;
    if (records.length !== expectedCount || aggregate.transactionCount !== expectedCount) {
      matchedFail("round topology contains the wrong transaction count");
    }
    const derivedGas = records.reduce((sum, record) => sum + BigInt(record.gasUsed), 0n);
    const derivedFee = records.reduce((sum, record) => sum + BigInt(record.actualFeeWei), 0n);
    if (requireDecimal(aggregate.totalGasUsed, `${key} round gas`) !== derivedGas) matchedFail(`${key} round gas does not agree with receipts`);
    if (requireDecimal(aggregate.totalActualFeeWei, `${key} round fee`) !== derivedFee) matchedFail(`${key} round fee does not agree with receipts`);
    const wallClock = requireFiniteNonNegative(aggregate.wallClockMs, `${key} round wall-clock duration`, matchedFail);
    const derivedWallClock =
      Math.max(...records.map((record) => record.receiptOffsetMs)) -
      Math.min(...records.map((record) => record.startedOffsetMs));
    if (wallClock !== derivedWallClock) matchedFail(`${key} round wall-clock duration does not match monotonic offsets`);
  }
  if (requireDecimal(raw.totalGasUsed, "matched experiment gas") !== experimentGas) matchedFail("experiment gas does not agree with receipts");
  if (requireDecimal(raw.totalActualFeeWei, "matched experiment fee") !== experimentFee) matchedFail("experiment fee does not agree with receipts");

  const merkle = raw.transactions.filter((record) => record.kind === "merkle-registration");
  if (
    merkle.length !== 6 ||
    merkle.some((record, index) =>
      record.round !== index ||
      record.batchCountBefore !== index ||
      record.batchCountAfter !== index + 1
    ) ||
    raw.finalMerkleBatchCount !== 6
  ) {
    matchedFail("Merkle batch count must progress from 0 to 6 exactly once");
  }
  if (raw.transactions.some((record) =>
    record.kind !== "merkle-registration" &&
    (record.batchCountBefore !== null || record.batchCountAfter !== null)
  )) {
    matchedFail("only Merkle transactions may carry batch count observations");
  }
  assertPublicMatchedMetadata(raw);
}

function summarizeExactDecimalStrings(values) {
  if (!Array.isArray(values) || values.length !== 5 || values.some((value) => !/^\d+$/.test(value))) {
    throw new Error("Expected exactly five decimal-string observations");
  }
  const sorted = [...values].sort((left, right) => {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return {
    observations: [...values],
    statistics: { count: 5, min: sorted[0], median: sorted[2], max: sorted[4] },
  };
}

function weiToEthString(value) {
  const wei = BigInt(value);
  const whole = wei / 1_000_000_000_000_000_000n;
  const remainder = wei % 1_000_000_000_000_000_000n;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

function exactMetric(rounds, selector) {
  return summarizeExactDecimalStrings(rounds.map(selector));
}

function divideDecimalIntegerByTen(value) {
  const integer = BigInt(value);
  const whole = integer / 10n;
  const remainder = integer % 10n;
  return remainder === 0n ? whole.toString() : `${whole}.${remainder}`;
}

function exactGasPerModelMetric(totalGas) {
  return {
    observations: totalGas.observations.map(divideDecimalIntegerByTen),
    statistics: {
      count: 5,
      min: divideDecimalIntegerByTen(totalGas.statistics.min),
      median: divideDecimalIntegerByTen(totalGas.statistics.median),
      max: divideDecimalIntegerByTen(totalGas.statistics.max),
    },
  };
}

function numericMetric(rounds, selector) {
  const observations = rounds.map(selector);
  return { observations, statistics: summarizeFive(observations) };
}

export function analyzeMatchedBenchmark(raw, local, localDigestSha256, sourceComparison) {
  validateCompletedSepoliaResult(raw);
  validateCompletedMatchedHardhatResult(local);
  if (typeof localDigestSha256 !== "string" || !/^[0-9a-f]{64}$/.test(localDigestSha256)) {
    throw new Error("Matched local artifact SHA-256 must be lowercase hexadecimal");
  }
  if (
    raw.codeVersion !== local.codeVersion ||
    sourceComparison?.codeVersionIdentifiersMatch !== true ||
    sourceComparison?.modelRegistrySourceUnchanged !== true ||
    sourceComparison?.bytecodeIdentityClaimed !== false
  ) {
    throw new Error("Sepolia and matched Hardhat evidence must use the same code version and unchanged contract source");
  }
  const recorded = (artifact, strategy) => artifact.rounds
    .filter((round) => round.strategy === strategy && round.warmup === false)
    .sort((left, right) => left.round - right.round);
  const strategySummary = (artifact, strategy) => {
    const rounds = recorded(artifact, strategy);
    const totalGas = exactMetric(rounds, (round) => round.totalGasUsed);
    const feeWei = rounds.map((round) => round.totalActualFeeWei);
    const feeEth = feeWei.map(weiToEthString);
    const feeStats = summarizeExactDecimalStrings(feeWei).statistics;
    return {
      totalGas,
      gasPerModel: exactGasPerModelMetric(totalGas),
      roundEndToEndMs: numericMetric(rounds, (round) => round.wallClockMs),
      actualFeeWei: { observations: feeWei, statistics: feeStats },
      actualFeeEth: {
        observations: feeEth,
        statistics: {
          count: 5,
          min: weiToEthString(feeStats.min),
          median: weiToEthString(feeStats.median),
          max: weiToEthString(feeStats.max),
        },
      },
    };
  };
  const individual = strategySummary(raw, "individual");
  const merkle = strategySummary(raw, "merkle");
  const localIndividual = strategySummary(local, "individual");
  const localMerkle = strategySummary(local, "merkle");
  return {
    seriesId: raw.seriesId,
    localReference: {
      seriesId: local.seriesId,
      sha256: localDigestSha256,
      topology: local.topology,
    },
    generatedAtUtc: new Date().toISOString(),
    method: "five recorded observations; median and min-max",
    batchSize: 10,
    recordedRounds: 5,
    individual,
    merkle,
    localMatched: { individual: localIndividual, merkle: localMerkle },
    comparison: {
      sepoliaMerkleGasSavingPct: gasSavingPercentage(Number(individual.totalGas.statistics.median), Number(merkle.totalGas.statistics.median)),
      localMerkleGasSavingPct: gasSavingPercentage(Number(localIndividual.totalGas.statistics.median), Number(localMerkle.totalGas.statistics.median)),
      individualGasDifferenceFromLocalPct: percentageDifference(Number(individual.totalGas.statistics.median), Number(localIndividual.totalGas.statistics.median)),
      merkleGasDifferenceFromLocalPct: percentageDifference(Number(merkle.totalGas.statistics.median), Number(localMerkle.totalGas.statistics.median)),
    },
    sourceComparison: { ...sourceComparison },
    limitations: [
      "A single batch size (10 models) and five recorded observations per strategy were summarized.",
      "Confirmation latency and fees reflect one time-dependent Sepolia public-network series and RPC path.",
      "The matched Hardhat reference reproduces storage topology, not public-network timing or fee conditions.",
      "Source equality and a local deployed-bytecode hash do not establish deployed Sepolia bytecode identity.",
    ],
  };
}

function resolveCommit(repositoryPath, identifier, label) {
  if (typeof identifier !== "string" || !FULL_COMMIT_PATTERN.test(identifier)) {
    throw new Error(`${label} must be a full 40-character hexadecimal commit identifier`);
  }
  try {
    const objectType = execFileSync(
      "git",
      ["cat-file", "-t", identifier],
      { cwd: repositoryPath, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    if (objectType !== "commit") {
      throw new Error(`${label} does not name a commit object`);
    }
    return execFileSync(
      "git",
      ["rev-parse", "--verify", `${identifier}^{commit}`],
      { cwd: repositoryPath, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
  } catch (error) {
    throw new Error(`${label} must resolve to a commit object`, { cause: error });
  }
}

export function compareRelevantContractSource(repositoryPath, localCommit, sepoliaCommit) {
  if (typeof repositoryPath !== "string" || repositoryPath.length === 0) {
    throw new Error("Repository path is required");
  }
  const resolvedLocalCommit = resolveCommit(repositoryPath, localCommit, "Local code-version identifier");
  const resolvedSepoliaCommit = resolveCommit(repositoryPath, sepoliaCommit, "Sepolia code-version identifier");
  let modelRegistrySourceUnchanged;
  try {
    execFileSync(
      "git",
      ["diff", "--quiet", "--no-ext-diff", resolvedLocalCommit, resolvedSepoliaCommit, "--", "contracts/contracts/ModelRegistry.sol"],
      { cwd: repositoryPath, stdio: ["ignore", "ignore", "pipe"] }
    );
    modelRegistrySourceUnchanged = true;
  } catch (error) {
    if (error && typeof error === "object" && error.status === 1) {
      modelRegistrySourceUnchanged = false;
    } else {
      throw new Error("git diff could not compare ModelRegistry.sol", { cause: error });
    }
  }
  return {
    codeVersionIdentifiersMatch: resolvedLocalCommit === resolvedSepoliaCommit,
    modelRegistrySourceUnchanged,
    bytecodeIdentityClaimed: false,
  };
}

function percentageDifference(value, reference) {
  return ((value - reference) / reference) * 100;
}

function gasSavingPercentage(individual, merkle) {
  return ((individual - merkle) / individual) * 100;
}

async function existingOutputEndpoint(path, inspect) {
  try {
    return await inspect(path);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 3) {
    throw new Error("Usage requires exactly three paths: <raw-sepolia.json> <matched-hardhat.json> <summary.json>");
  }
  const [rawArgument, localArgument, outputArgument] = args;
  const rawPath = resolve(rawArgument);
  const localPath = resolve(localArgument);
  const localDigestPath = `${localPath}.sha256`;
  const outputPath = resolve(outputArgument);
  const resolvedPaths = [rawPath, localPath, localDigestPath, outputPath];
  if (new Set(resolvedPaths).size !== resolvedPaths.length) {
    throw new Error("Analysis requires four distinct filesystem endpoints; path aliases are not allowed");
  }
  const canonicalPaths = await Promise.all([
    realpath(rawPath),
    realpath(localPath),
    realpath(localDigestPath),
    existingOutputEndpoint(outputPath, realpath),
  ]);
  const existingCanonicalPaths = canonicalPaths.filter((path) => path !== null);
  if (new Set(existingCanonicalPaths).size !== existingCanonicalPaths.length) {
    throw new Error("Analysis requires four distinct filesystem endpoints; path aliases are not allowed");
  }
  const identities = await Promise.all([
    stat(rawPath, { bigint: true }),
    stat(localPath, { bigint: true }),
    stat(localDigestPath, { bigint: true }),
    existingOutputEndpoint(outputPath, (path) => stat(path, { bigint: true })),
  ]);
  for (let left = 0; left < identities.length; left += 1) {
    if (identities[left] === null) continue;
    for (let right = left + 1; right < identities.length; right += 1) {
      if (identities[right] !== null && sameFileIdentity(identities[left], identities[right])) {
        throw new Error("Analysis requires four distinct filesystem endpoints; path aliases are not allowed");
      }
    }
  }
  const raw = JSON.parse(await readFile(rawPath, "utf8"));
  const localBytes = await readFile(localPath);
  const digestText = await readFile(localDigestPath, "utf8");
  if (!/^[0-9a-f]{64}\n$/.test(digestText)) {
    throw new Error("Matched local artifact sibling SHA-256 must be lowercase 64-hex plus newline");
  }
  const localDigest = createHash("sha256").update(localBytes).digest("hex");
  if (digestText !== `${localDigest}\n`) {
    throw new Error("Matched local artifact SHA-256 digest does not match exact JSON bytes");
  }
  let localReference;
  try {
    localReference = JSON.parse(localBytes.toString("utf8"));
  } catch (error) {
    throw new Error("Matched local reference must be JSON; the legacy CSV remains valid only for the original thesis experiment", { cause: error });
  }
  const sourceComparison = compareRelevantContractSource(process.cwd(), localReference.codeVersion, raw.codeVersion);
  const summary = analyzeMatchedBenchmark(raw, localReference, localDigest, sourceComparison);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Saved Sepolia benchmark summary to ${outputPath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
