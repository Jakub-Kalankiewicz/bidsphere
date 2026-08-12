import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_BATCH_SIZE = 10;
const EXPECTED_WARMUP_ROUNDS = 1;
const EXPECTED_RECORDED_ROUNDS = 5;
const EXPECTED_TOTAL_ROUNDS = 6;
const EXPECTED_TRANSACTION_COUNT = 68;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
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
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    fail(`${label} must be a decimal string`);
  }
  const parsed = BigInt(value);
  if (allowZero ? parsed < 0n : parsed <= 0n) {
    fail(`${label} must be ${allowZero ? "non-negative" : "positive"}`);
  }
  return parsed;
}

function requireFiniteNonNegative(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite non-negative number`);
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

function expectedTransactionKey(record) {
  if (record.kind === "deployment") {
    if (
      (record.strategy !== "individual" && record.strategy !== "merkle") ||
      record.round !== null ||
      record.warmup !== false ||
      record.sequenceInRound !== null ||
      record.operationId !== `deployment:${record.strategy}`
    ) {
      fail("transaction topology does not match the two deployments");
    }
    return record.operationId;
  }

  if (!Number.isInteger(record.round) || record.round < 0 || record.round >= 6) {
    fail("transaction topology has an invalid round");
  }
  if (record.warmup !== (record.round === 0)) {
    fail("transaction topology has an invalid warm-up marker");
  }

  if (record.kind === "individual-registration") {
    if (
      record.strategy !== "individual" ||
      !Number.isInteger(record.sequenceInRound) ||
      record.sequenceInRound < 0 ||
      record.sequenceInRound >= 10 ||
      record.operationId !== `individual:${record.round}:${record.sequenceInRound}`
    ) {
      fail("individual transaction topology is invalid");
    }
    return record.operationId;
  }

  if (record.kind === "merkle-registration") {
    if (
      record.strategy !== "merkle" ||
      record.sequenceInRound !== 10 ||
      record.operationId !== `merkle:${record.round}`
    ) {
      fail("Merkle transaction topology is invalid");
    }
    return record.operationId;
  }

  fail("transaction topology contains an unknown operation kind");
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

function validatePlannedOperations(raw) {
  if (!Array.isArray(raw.plannedOperations) || raw.plannedOperations.length !== 68) {
    fail("planned-operation topology must contain exactly 68 operations");
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
      fail("planned-operation topology does not match the canonical benchmark plan");
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
  if (raw.schemaVersion !== 1) fail("schema version must be 1");
  if (raw.network !== "sepolia") fail('network must be "sepolia"');
  if (raw.chainId !== 11155111) fail("chain ID must be 11155111");
  if (raw.status !== "completed" || raw.abortReason !== null) {
    fail("status must be completed without an abort reason");
  }
  if (typeof raw.seriesId !== "string" || raw.seriesId.length === 0) fail("series ID is required");
  if (typeof raw.codeVersion !== "string" || raw.codeVersion.length === 0) fail("code version is required");
  if (typeof raw.completedAtUtc !== "string" || Number.isNaN(Date.parse(raw.completedAtUtc))) {
    fail("completion timestamp is required");
  }

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
  requireDecimal(configuration.approvedMaximumWei, "configuration approved maximum");

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

  for (const transactionValue of raw.transactions) {
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

    const gasUsed = requireDecimal(record.gasUsed, `${operationId} gas used`);
    const effectiveGasPrice = requireDecimal(record.effectiveGasPriceWei, `${operationId} effective gas price`);
    const actualFee = requireDecimal(record.actualFeeWei, `${operationId} actual fee`);
    if (gasUsed * effectiveGasPrice !== actualFee) {
      fail(`${operationId} receipt fee does not equal gas used times effective gas price`);
    }
    requireFiniteNonNegative(record.endToEndMs, `${operationId} end-to-end duration`);
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
    requireFiniteNonNegative(aggregate.wallClockMs, `${key} round wall-clock duration`);
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
  if (requireDecimal(raw.reservedPendingWei, "reserved pending fee", { allowZero: true }) !== 0n) {
    fail("a completed experiment cannot retain a pending fee reservation");
  }
}

function parseCsv(csvText) {
  if (typeof csvText !== "string") throw new Error("Local benchmark CSV must be text");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (quoted) {
      if (character === '"' && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csvText[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Local benchmark CSV contains an unterminated quote");
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function exactBigIntMedian(values) {
  const sorted = [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const middle = sorted.length / 2;
  const doubledMedian = sorted[middle - 1] + sorted[middle];
  const floor = doubledMedian / 2n;
  const floorNumber = Number(floor);

  if (doubledMedian % 2n === 0n) {
    if (!Number.isSafeInteger(floorNumber) || BigInt(floorNumber) !== floor) {
      throw new Error("Local benchmark CSV median cannot be exactly represented as a JavaScript number");
    }
    return floorNumber;
  }

  const ceil = floor + 1n;
  const ceilNumber = Number(ceil);
  const candidate = floorNumber + 0.5;
  if (
    !Number.isSafeInteger(floorNumber) ||
    !Number.isSafeInteger(ceilNumber) ||
    BigInt(floorNumber) !== floor ||
    BigInt(ceilNumber) !== ceil ||
    candidate - floorNumber !== 0.5 ||
    ceilNumber - candidate !== 0.5
  ) {
    throw new Error("Local benchmark CSV median cannot be exactly represented as a JavaScript number");
  }
  return candidate;
}

export function parseLocalBatchTenCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error("Local benchmark CSV is empty");
  const header = rows[0];
  const requiredHeaders = ["commit", "network", "batch_size", "individual_total_gas", "merkle_batch_gas"];
  const indexes = Object.fromEntries(requiredHeaders.map((name) => [name, header.indexOf(name)]));
  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error("Local benchmark CSV is missing a required header");
  }
  const matching = rows.slice(1).filter(
    (fields) => fields[indexes.network] === "hardhat" && fields[indexes.batch_size] === "10"
  );
  if (matching.length !== 30) {
    throw new Error("Local benchmark CSV must contain exactly 30 Hardhat batch-size-10 rows");
  }
  const codeVersions = new Set(matching.map((fields) => fields[indexes.commit]));
  if (codeVersions.size !== 1 || [...codeVersions][0].length === 0) {
    throw new Error("Local benchmark rows must share one non-empty commit identifier");
  }
  const parseGas = (fields, headerName) => {
    const value = fields[indexes[headerName]];
    if (!/^\d+$/.test(value)) throw new Error(`${headerName} must contain positive integers`);
    const integer = BigInt(value);
    if (integer <= 0n) throw new Error(`${headerName} must contain positive integers`);
    return integer;
  };
  return {
    network: "hardhat",
    batchSize: 10,
    rows: 30,
    codeVersion: [...codeVersions][0],
    individualTotalGasMedian: exactBigIntMedian(matching.map((fields) => parseGas(fields, "individual_total_gas"))),
    merkleBatchGasMedian: exactBigIntMedian(matching.map((fields) => parseGas(fields, "merkle_batch_gas"))),
  };
}

export function compareRelevantContractSource(repositoryPath, localCommit, sepoliaCommit) {
  if (![repositoryPath, localCommit, sepoliaCommit].every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error("Repository path and both code-version identifiers are required");
  }
  let modelRegistrySourceUnchanged;
  try {
    execFileSync(
      "git",
      ["diff", "--quiet", localCommit, sepoliaCommit, "--", "contracts/contracts/ModelRegistry.sol"],
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
    codeVersionIdentifiersMatch: localCommit === sepoliaCommit,
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

export function analyzeSepoliaBenchmark(raw, localReference, sourceComparison) {
  validateCompletedSepoliaResult(raw);
  if (
    localReference?.network !== "hardhat" ||
    localReference?.batchSize !== 10 ||
    localReference?.rows !== 30 ||
    typeof localReference.codeVersion !== "string" ||
    !Number.isFinite(localReference.individualTotalGasMedian) ||
    !Number.isFinite(localReference.merkleBatchGasMedian)
  ) {
    throw new Error("Invalid local Hardhat batch-ten reference");
  }
  if (
    typeof sourceComparison?.codeVersionIdentifiersMatch !== "boolean" ||
    typeof sourceComparison?.modelRegistrySourceUnchanged !== "boolean" ||
    sourceComparison?.bytecodeIdentityClaimed !== false
  ) {
    throw new Error("Invalid source comparison");
  }

  const recordedRounds = (strategy) => raw.rounds
    .filter((round) => round.strategy === strategy && round.warmup === false)
    .sort((left, right) => left.round - right.round);
  const buildStrategy = (strategy) => {
    const rounds = recordedRounds(strategy);
    return {
      totalGas: summarizeFive(rounds.map((round) => requireSafeNumber(BigInt(round.totalGasUsed), `${strategy} round gas`))),
      gasPerModel: summarizeFive(rounds.map((round) => requireSafeNumber(BigInt(round.totalGasUsed), `${strategy} round gas`) / 10)),
      roundEndToEndMs: summarizeFive(rounds.map((round) => round.wallClockMs)),
      actualFeeWei: summarizeFive(rounds.map((round) => requireSafeNumber(BigInt(round.totalActualFeeWei), `${strategy} round fee`))),
    };
  };
  const individual = buildStrategy("individual");
  const merkle = buildStrategy("merkle");
  const limitations = [
    "A single batch size (10 models) was observed.",
    "Only five recorded observations per strategy were summarized.",
    "Confirmation latency and fees reflect one time-dependent Sepolia public-network series and RPC path.",
    "Source equality does not establish deployed bytecode identity.",
  ];
  if (!sourceComparison.codeVersionIdentifiersMatch) {
    limitations.push("The local and Sepolia code-version identifiers differ.");
  }
  if (!sourceComparison.modelRegistrySourceUnchanged) {
    limitations.push("ModelRegistry.sol changed between the local and Sepolia code versions.");
  }

  return {
    source: raw.codeVersion,
    localSource: localReference.codeVersion,
    seriesId: raw.seriesId,
    generatedAtUtc: new Date().toISOString(),
    method: "five recorded observations; median and min-max",
    batchSize: 10,
    recordedRounds: 5,
    individual,
    merkle,
    comparison: {
      sepoliaMerkleGasSavingPct: gasSavingPercentage(individual.totalGas.median, merkle.totalGas.median),
      localMerkleGasSavingPct: gasSavingPercentage(localReference.individualTotalGasMedian, localReference.merkleBatchGasMedian),
      individualGasDifferenceFromLocalPct: percentageDifference(individual.totalGas.median, localReference.individualTotalGasMedian),
      merkleGasDifferenceFromLocalPct: percentageDifference(merkle.totalGas.median, localReference.merkleBatchGasMedian),
    },
    sourceComparison: { ...sourceComparison },
    limitations,
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 3) {
    throw new Error("Usage requires exactly three paths: <raw-sepolia.json> <local-hardhat.csv> <summary.json>");
  }
  const [rawArgument, localArgument, outputArgument] = args;
  const rawPath = resolve(rawArgument);
  const localPath = resolve(localArgument);
  const outputPath = resolve(outputArgument);
  const resolvedPaths = [rawPath, localPath, outputPath];
  if (new Set(resolvedPaths).size !== resolvedPaths.length) {
    throw new Error("Analysis requires three distinct paths; path aliases are not allowed");
  }
  const canonicalPaths = await Promise.all(resolvedPaths.map(async (path) => {
    try {
      return await realpath(path);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") return null;
      throw error;
    }
  }));
  const existingCanonicalPaths = canonicalPaths.filter((path) => path !== null);
  if (new Set(existingCanonicalPaths).size !== existingCanonicalPaths.length) {
    throw new Error("Analysis requires three distinct paths; path aliases are not allowed");
  }
  const raw = JSON.parse(await readFile(rawPath, "utf8"));
  const localReference = parseLocalBatchTenCsv(await readFile(localPath, "utf8"));
  const sourceComparison = compareRelevantContractSource(process.cwd(), localReference.codeVersion, raw.codeVersion);
  const summary = analyzeSepoliaBenchmark(raw, localReference, sourceComparison);
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
