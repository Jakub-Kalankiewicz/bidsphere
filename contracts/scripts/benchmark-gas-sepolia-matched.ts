import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { artifacts, ethers, network } from "hardhat";

import {
  buildBenchmarkOperationPlan,
  validateBenchmarkCodeVersion,
  type BenchmarkOperation,
} from "./sepolia-benchmark-helpers";

interface MatchedTransactionRecord {
  operationId: string;
  kind: BenchmarkOperation["kind"];
  strategy: BenchmarkOperation["strategy"];
  round: number | null;
  warmup: boolean;
  sequenceInRound: number | null;
  modelIds: string[];
  merkleRoot: string | null;
  transactionHash: string;
  contractAddress: string;
  status: "confirmed";
  blockNumber: number;
  receiptStatus: 1;
  confirmationsRequested: 1;
  gasLimit: string;
  gasUsed: string;
  effectiveGasPriceWei: string;
  actualFeeWei: string;
  submittedAtUtc: string;
  receiptAtUtc: string;
  startedOffsetMs: number;
  receiptOffsetMs: number;
  endToEndMs: number;
  batchCountBefore: number | null;
  batchCountAfter: number | null;
}

interface MatchedRoundAggregate {
  strategy: BenchmarkOperation["strategy"];
  round: number;
  warmup: boolean;
  transactionCount: number;
  totalGasUsed: string;
  totalActualFeeWei: string;
  wallClockMs: number;
}

export interface SepoliaMatchedHardhatResult {
  schemaVersion: 2;
  kind: "hardhat-sepolia-matched";
  status: "completed";
  seriesId: string;
  startedAtUtc: string;
  completedAtUtc: string;
  network: "hardhat";
  chainId: 31337;
  codeVersion: string;
  topology: "one-long-lived-contract-per-strategy";
  runtime: {
    node: string;
    hardhat: string;
    solidityCompiler: {
      version: "0.8.19";
      optimizerEnabled: false;
      optimizerRuns: 200;
      evmVersion: "paris";
    };
  };
  deployedBytecodeKeccak256: string;
  configuration: {
    batchSize: 10;
    warmupRounds: 1;
    recordedRounds: 5;
    operationCount: 68;
  };
  contractAddresses: { individual: string; merkle: string };
  plannedOperations: Array<Omit<BenchmarkOperation, "gasLimit"> & { gasLimit: string }>;
  transactions: MatchedTransactionRecord[];
  rounds: MatchedRoundAggregate[];
  finalMerkleBatchCount: 6;
  totalGasUsed: string;
  totalActualFeeWei: string;
}

function seriesId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `hardhat-sepolia-matched-${timestamp}-${randomBytes(8).toString("hex")}`;
}

export function defaultMatchedBenchmarkOutputPath(benchmarkSeriesId: string): string {
  return resolve(
    __dirname,
    "..",
    "..",
    "measurements",
    "raw",
    "hardhat-sepolia-matched",
    `hardhat-sepolia-matched-${benchmarkSeriesId}.json`
  );
}

function assertCheckedOutCodeVersion(codeVersion: string): string {
  const repositoryRoot = resolve(__dirname, "../..");
  return validateBenchmarkCodeVersion(codeVersion, {
    objectType: (identifier) => {
      try {
        return execFileSync("git", ["cat-file", "-t", identifier], {
          cwd: repositoryRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        return "missing";
      }
    },
    headCommit: () =>
      execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  });
}

async function writeAtomicEvidence(
  outputPath: string,
  result: SepoliaMatchedHardhatResult
): Promise<void> {
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(`${outputPath}.tmp`, bytes);
  await rename(`${outputPath}.tmp`, outputPath);
  await writeFile(`${outputPath}.sha256.tmp`, `${digest}\n`, "utf8");
  await rename(`${outputPath}.sha256.tmp`, `${outputPath}.sha256`);
}

function aggregateRounds(records: MatchedTransactionRecord[]): MatchedRoundAggregate[] {
  const rounds: MatchedRoundAggregate[] = [];
  for (const strategy of ["individual", "merkle"] as const) {
    for (let round = 0; round < 6; round += 1) {
      const selected = records.filter(
        (record) => record.strategy === strategy && record.round === round
      );
      const started = selected.map((record) => record.startedOffsetMs);
      const completed = selected.map((record) => record.receiptOffsetMs);
      rounds.push({
        strategy,
        round,
        warmup: round === 0,
        transactionCount: selected.length,
        totalGasUsed: selected
          .reduce((total, record) => total + BigInt(record.gasUsed), 0n)
          .toString(),
        totalActualFeeWei: selected
          .reduce((total, record) => total + BigInt(record.actualFeeWei), 0n)
          .toString(),
        wallClockMs: Math.max(...completed) - Math.min(...started),
      });
    }
  }
  return rounds;
}

export async function runSepoliaMatchedBenchmark(
  outputPath: string,
  codeVersion: string,
  benchmarkSeriesId = seriesId()
): Promise<SepoliaMatchedHardhatResult> {
  codeVersion = assertCheckedOutCodeVersion(codeVersion);
  const runtimeNetwork = await ethers.provider.getNetwork();
  if (network.name !== "hardhat" || runtimeNetwork.chainId !== 31_337n) {
    throw new Error("Sepolia-matched reference must run on Hardhat chain 31337");
  }

  const startedAtUtc = new Date().toISOString();
  const seriesMonotonicOriginMs = performance.now();
  const operations = buildBenchmarkOperationPlan(benchmarkSeriesId);
  const factory = await ethers.getContractFactory("ModelRegistry");
  const artifact = await artifacts.readArtifact("ModelRegistry");
  const expectedBytecodeHash = ethers.keccak256(artifact.deployedBytecode);
  const transactions: MatchedTransactionRecord[] = [];
  let individualAddress: string | null = null;
  let merkleAddress: string | null = null;

  for (const operation of operations) {
    const submittedAtUtc = new Date().toISOString();
    const startedOffsetMs = performance.now() - seriesMonotonicOriginMs;
    let response;
    let countBefore: number | null = null;
    let contractAddress: string | null = null;

    if (operation.kind === "deployment") {
      const contract = await factory.deploy({ gasLimit: operation.gasLimit });
      response = contract.deploymentTransaction();
      if (!response) throw new Error("Deployment transaction is unavailable");
    } else if (operation.kind === "individual-registration") {
      if (!individualAddress) throw new Error("Individual contract is unavailable");
      contractAddress = individualAddress;
      const contract = await ethers.getContractAt("ModelRegistry", individualAddress);
      const modelId = operation.modelIds[0];
      response = await contract.registerModel(
        modelId,
        ethers.keccak256(ethers.toUtf8Bytes(modelId)),
        { gasLimit: operation.gasLimit }
      );
    } else {
      if (!merkleAddress || !operation.merkleRoot) {
        throw new Error("Merkle contract is unavailable");
      }
      contractAddress = merkleAddress;
      const contract = await ethers.getContractAt("ModelRegistry", merkleAddress);
      countBefore = Number(await contract.batchCount());
      response = await contract.registerMerkleRoot(
        operation.merkleRoot,
        operation.modelIds,
        { gasLimit: operation.gasLimit }
      );
    }

    if (response.gasLimit !== operation.gasLimit) {
      throw new Error(`Operation ${operation.operationId} did not use its fixed gas limit`);
    }

    const receipt = await response.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Operation ${operation.operationId} did not produce a status-one receipt`);
    }
    const receiptAtUtc = new Date().toISOString();
    const receiptOffsetMs = performance.now() - seriesMonotonicOriginMs;
    const gasPrice = receipt.gasPrice;
    let countAfter: number | null = null;
    if (operation.kind === "deployment") {
      if (!receipt.contractAddress) throw new Error("Deployment address is unavailable");
      contractAddress = receipt.contractAddress;
      if (operation.strategy === "individual") individualAddress = receipt.contractAddress;
      else merkleAddress = receipt.contractAddress;
    } else if (operation.kind === "merkle-registration") {
      const contract = await ethers.getContractAt("ModelRegistry", merkleAddress!);
      countAfter = Number(await contract.batchCount());
    }
    if (!contractAddress) {
      throw new Error(`Operation ${operation.operationId} has no contract address`);
    }

    transactions.push({
      operationId: operation.operationId,
      kind: operation.kind,
      strategy: operation.strategy,
      round: operation.round,
      warmup: operation.warmup,
      sequenceInRound: operation.sequenceInRound,
      modelIds: [...operation.modelIds],
      merkleRoot: operation.merkleRoot,
      transactionHash: receipt.hash,
      contractAddress,
      status: "confirmed",
      blockNumber: receipt.blockNumber,
      receiptStatus: 1,
      confirmationsRequested: 1,
      gasLimit: response.gasLimit.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPriceWei: gasPrice.toString(),
      actualFeeWei: (receipt.gasUsed * gasPrice).toString(),
      submittedAtUtc,
      receiptAtUtc,
      startedOffsetMs,
      receiptOffsetMs,
      endToEndMs: receiptOffsetMs - startedOffsetMs,
      batchCountBefore: countBefore,
      batchCountAfter: countAfter,
    });
  }

  if (!individualAddress || !merkleAddress) throw new Error("Two deployments are required");
  const [individualCode, merkleCode] = await Promise.all([
    ethers.provider.getCode(individualAddress),
    ethers.provider.getCode(merkleAddress),
  ]);
  if (
    ethers.keccak256(individualCode) !== expectedBytecodeHash ||
    ethers.keccak256(merkleCode) !== expectedBytecodeHash
  ) {
    throw new Error("Deployed bytecode does not match the compiled artifact");
  }
  const finalMerkleBatchCount = Number(
    await (await ethers.getContractAt("ModelRegistry", merkleAddress)).batchCount()
  );
  if (finalMerkleBatchCount !== 6) throw new Error("Merkle batch count must finish at six");

  const result: SepoliaMatchedHardhatResult = {
    schemaVersion: 2,
    kind: "hardhat-sepolia-matched",
    status: "completed",
    seriesId: benchmarkSeriesId,
    startedAtUtc,
    completedAtUtc: new Date().toISOString(),
    network: "hardhat",
    chainId: 31_337,
    codeVersion,
    topology: "one-long-lived-contract-per-strategy",
    runtime: {
      node: process.version,
      hardhat: require("hardhat/package.json").version,
      solidityCompiler: {
        version: "0.8.19",
        optimizerEnabled: false,
        optimizerRuns: 200,
        evmVersion: "paris",
      },
    },
    deployedBytecodeKeccak256: expectedBytecodeHash,
    configuration: {
      batchSize: 10,
      warmupRounds: 1,
      recordedRounds: 5,
      operationCount: 68,
    },
    contractAddresses: { individual: individualAddress, merkle: merkleAddress },
    plannedOperations: operations.map(({ gasLimit, ...operation }) => ({
      ...operation,
      gasLimit: gasLimit.toString(),
    })),
    transactions,
    rounds: aggregateRounds(transactions),
    finalMerkleBatchCount: 6,
    totalGasUsed: transactions
      .reduce((total, record) => total + BigInt(record.gasUsed), 0n)
      .toString(),
    totalActualFeeWei: transactions
      .reduce((total, record) => total + BigInt(record.actualFeeWei), 0n)
      .toString(),
  };
  await writeAtomicEvidence(resolve(outputPath), result);
  return result;
}

async function main(): Promise<void> {
  const codeVersion = process.env.GAS_BENCHMARK_COMMIT?.trim();
  if (!codeVersion) throw new Error("GAS_BENCHMARK_COMMIT is required");
  const benchmarkSeriesId = seriesId();
  const configuredOutput = process.env.HARDHAT_MATCHED_BENCHMARK_OUTPUT?.trim();
  const rawPath = configuredOutput
    ? resolve(configuredOutput)
    : defaultMatchedBenchmarkOutputPath(benchmarkSeriesId);
  await runSepoliaMatchedBenchmark(rawPath, codeVersion, benchmarkSeriesId);
  const checksumPath = `${rawPath}.sha256`;
  const sha256 = (await readFile(checksumPath, "utf8")).trim();
  console.log(JSON.stringify({ rawPath, checksumPath, sha256 }));
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
