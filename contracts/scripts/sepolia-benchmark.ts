import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";
import type {
  Contract,
  ContractFactory,
  ContractTransactionResponse,
  TransactionReceipt,
} from "ethers";

import { writeBenchmarkCheckpoint } from "./sepolia-benchmark-checkpoint";
import {
  SEPOLIA_BENCHMARK_CONFIG,
  abortBenchmarkResult,
  aggregateRound,
  assertNextTransactionWithinBudget,
  buildBenchmarkOperationPlan,
  buildConfirmedTransactionRecord,
  calculateReservedPendingWei,
  completeBenchmarkResult,
  createBenchmarkSeriesId,
  createInitialBenchmarkResult,
  parseApprovedMaximumWei,
  recoverSameHashStatusZeroReceipt,
  withTimeout,
  type BenchmarkOperation,
  type BenchmarkTransactionRecord,
  type SepoliaBenchmarkResult,
} from "./sepolia-benchmark-helpers";
import {
  assertGasEstimateWithinLimit,
  assertSepoliaPreflightInputs,
} from "./sepolia-smoke-helpers";

interface PreparedOperation {
  gasEstimate: bigint;
  broadcast: (overrides: TransactionFeeOverrides) => Promise<BroadcastOperation>;
}

interface BroadcastOperation {
  transaction: ContractTransactionResponse;
  deployedContract: Contract | null;
}

interface TransactionFeeOverrides {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

function benchmarkProviderLabel(value: string | undefined): string | null {
  if (value === undefined) return null;
  const label = value.trim();
  if (!/^[A-Za-z0-9 ._-]{1,80}$/.test(label)) {
    throw new Error("SEPOLIA_BENCHMARK_RPC_PROVIDER_LABEL must be a plain label");
  }
  return label;
}

function requiredCodeVersion(value: string | undefined): string {
  const codeVersion = value?.trim();
  if (!codeVersion) {
    throw new Error("SEPOLIA_BENCHMARK_CODE_VERSION is required");
  }
  return codeVersion;
}

function sanitizeErrorMessage(
  error: unknown,
  forbiddenValues: readonly string[]
): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of forbiddenValues) {
    if (value) message = message.split(value).join("[redacted]");
  }
  message = message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\b(?:0x)?[A-Fa-f0-9]{64}\b/g, "[redacted-32-byte-value]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return message || "Benchmark aborted";
}

function buildPendingTransactionRecord(input: {
  operation: BenchmarkOperation;
  transactionHash: string;
  gasEstimate: bigint;
  maxFeePerGasWei: bigint;
  maxPriorityFeePerGasWei: bigint;
  submittedAtUtc: string;
  startedMs: number;
  broadcastMs: number;
}): BenchmarkTransactionRecord {
  if (input.broadcastMs < input.startedMs) {
    throw new Error("Transaction timings must be monotonic");
  }
  return {
    operationId: input.operation.operationId,
    kind: input.operation.kind,
    strategy: input.operation.strategy,
    round: input.operation.round,
    warmup: input.operation.warmup,
    sequenceInRound: input.operation.sequenceInRound,
    status: "pending",
    transactionHash: input.transactionHash,
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
    receiptAtUtc: null,
    submissionMs: input.broadcastMs - input.startedMs,
    confirmationMs: null,
    endToEndMs: null,
  };
}

function updateRunningResultAfterReceipt(
  result: SepoliaBenchmarkResult,
  confirmed: BenchmarkTransactionRecord,
  roundWallClockMs: number | null
): SepoliaBenchmarkResult {
  const transactions = result.transactions.map((record) =>
    record.operationId === confirmed.operationId ? confirmed : record
  );
  const rounds = [...result.rounds];
  if (confirmed.round !== null) {
    const roundRecords = transactions.filter(
      (record) =>
        record.status === "confirmed" &&
        record.strategy === confirmed.strategy &&
        record.round === confirmed.round
    );
    const derivedAggregate = aggregateRound(roundRecords);
    const aggregate = {
      ...derivedAggregate,
      wallClockMs: roundWallClockMs ?? derivedAggregate.wallClockMs,
    };
    const existingIndex = rounds.findIndex(
      (round) =>
        round.strategy === confirmed.strategy && round.round === confirmed.round
    );
    if (existingIndex === -1) rounds.push(aggregate);
    else rounds[existingIndex] = aggregate;
  }

  return {
    ...result,
    transactions,
    rounds,
    totalGasUsed: (
      BigInt(result.totalGasUsed) + BigInt(confirmed.gasUsed ?? "0")
    ).toString(),
    totalActualFeeWei: (
      BigInt(result.totalActualFeeWei) + BigInt(confirmed.actualFeeWei ?? "0")
    ).toString(),
    reservedPendingWei: calculateReservedPendingWei(transactions).toString(),
  };
}

async function prepareOperation(
  operation: BenchmarkOperation,
  factory: ContractFactory,
  deployerAddress: string,
  individualContract: Contract | null,
  merkleContract: Contract | null
): Promise<PreparedOperation> {
  if (operation.kind === "deployment") {
    const deploymentRequest = await factory.getDeployTransaction();
    const gasEstimate = await ethers.provider.estimateGas({
      ...deploymentRequest,
      from: deployerAddress,
    });
    return {
      gasEstimate,
      broadcast: async (overrides) => {
        const contract = (await factory.deploy(overrides)) as unknown as Contract;
        const transaction = contract.deploymentTransaction();
        if (!transaction) throw new Error("Deployment did not return a transaction");
        return { transaction, deployedContract: contract };
      },
    };
  }

  if (operation.kind === "individual-registration") {
    if (!individualContract || operation.modelIds.length !== 1) {
      throw new Error("Individual contract is unavailable for registration");
    }
    const modelId = operation.modelIds[0];
    const modelHash = ethers.keccak256(ethers.toUtf8Bytes(modelId));
    const gasEstimate = await individualContract.registerModel.estimateGas(
      modelId,
      modelHash
    );
    return {
      gasEstimate,
      broadcast: async (overrides) => ({
        transaction: await individualContract.registerModel(
          modelId,
          modelHash,
          overrides
        ),
        deployedContract: null,
      }),
    };
  }

  if (!merkleContract || !operation.merkleRoot) {
    throw new Error("Merkle contract is unavailable for registration");
  }
  const gasEstimate = await merkleContract.registerMerkleRoot.estimateGas(
    operation.merkleRoot,
    operation.modelIds
  );
  return {
    gasEstimate,
    broadcast: async (overrides) => ({
      transaction: await merkleContract.registerMerkleRoot(
        operation.merkleRoot,
        operation.modelIds,
        overrides
      ),
      deployedContract: null,
    }),
  };
}

async function main(): Promise<void> {
  const forbiddenValues = [
    process.env.SEPOLIA_RPC_URL ?? "",
    process.env.BLOCKCHAIN_PRIVATE_KEY ?? "",
  ];
  let result: SepoliaBenchmarkResult | null = null;
  let outputPath: string | null = null;
  let deployerAddress: string | null = null;

  try {
    const runtimeNetwork = await ethers.provider.getNetwork();
    assertSepoliaPreflightInputs(network.name, runtimeNetwork.chainId, process.env);
    const [deployer] = await ethers.getSigners();
    if (!deployer) throw new Error("No Sepolia deployer is configured");
    deployerAddress = deployer.address;

    const approvedMaximumWei = parseApprovedMaximumWei(
      process.env.SEPOLIA_BENCHMARK_MAX_COST_WEI
    );
    const codeVersion = requiredCodeVersion(
      process.env.SEPOLIA_BENCHMARK_CODE_VERSION
    );
    const rpcProviderLabel = benchmarkProviderLabel(
      process.env.SEPOLIA_BENCHMARK_RPC_PROVIDER_LABEL
    );
    const startedAtUtc = new Date().toISOString();
    const seriesId = createBenchmarkSeriesId(new Date(startedAtUtc));
    const operations = buildBenchmarkOperationPlan(seriesId);
    const balanceBeforeWei = await ethers.provider.getBalance(deployer.address);
    outputPath = resolve(
      __dirname,
      "../../measurements/raw/sepolia",
      `${seriesId}.json`
    );
    result = createInitialBenchmarkResult(
      {
        seriesId,
        startedAtUtc,
        rpcProviderLabel,
        codeVersion,
        deployerAddress: deployer.address,
        approvedMaximumWei,
        balanceBeforeWei,
        runtime: {
          node: process.version,
          hardhat: require("hardhat/package.json").version,
        },
      },
      operations
    );
    await writeBenchmarkCheckpoint(outputPath, result, forbiddenValues);

    const factory = await ethers.getContractFactory("ModelRegistry", deployer);
    let individualContract: Contract | null = null;
    let merkleContract: Contract | null = null;
    const roundStartedAtMs = new Map<string, number>();

    for (const operation of operations) {
      const feeData = await ethers.provider.getFeeData();
      const maxFeePerGasWei = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!maxFeePerGasWei || maxFeePerGasWei <= 0n) {
        throw new Error("RPC did not return a usable maximum fee per gas");
      }
      const maxPriorityFeePerGasWei = feeData.maxPriorityFeePerGas ?? 0n;
      if (maxPriorityFeePerGasWei < 0n) {
        throw new Error("RPC returned a negative maximum priority fee per gas");
      }

      const prepared = await prepareOperation(
        operation,
        factory,
        deployer.address,
        individualContract,
        merkleContract
      );
      assertGasEstimateWithinLimit(
        prepared.gasEstimate,
        operation.gasLimit,
        operation.operationId
      );
      assertNextTransactionWithinBudget({
        actualSpentWei: BigInt(result.totalActualFeeWei),
        reservedPendingWei: calculateReservedPendingWei(result.transactions),
        nextGasLimit: operation.gasLimit,
        maxFeePerGasWei,
        approvedMaximumWei,
      });
      const nextWorstCaseWei = operation.gasLimit * maxFeePerGasWei;
      const currentBalanceWei = await ethers.provider.getBalance(deployer.address);
      if (currentBalanceWei < nextWorstCaseWei) {
        throw new Error("Sepolia wallet balance does not cover the next transaction");
      }

      const overrides: TransactionFeeOverrides = {
        gasLimit: operation.gasLimit,
        maxFeePerGas: maxFeePerGasWei,
        maxPriorityFeePerGas: maxPriorityFeePerGasWei,
      };
      const startedMs = performance.now();
      const roundKey =
        operation.round === null
          ? null
          : `${operation.strategy}:${operation.round}`;
      if (roundKey && !roundStartedAtMs.has(roundKey)) {
        roundStartedAtMs.set(roundKey, startedMs);
      }
      const submittedAtUtc = new Date().toISOString();
      const broadcast = await prepared.broadcast(overrides);
      const broadcastMs = performance.now();
      const pending = buildPendingTransactionRecord({
        operation,
        transactionHash: broadcast.transaction.hash,
        gasEstimate: prepared.gasEstimate,
        maxFeePerGasWei,
        maxPriorityFeePerGasWei,
        submittedAtUtc,
        startedMs,
        broadcastMs,
      });
      result = {
        ...result,
        transactions: [...result.transactions, pending],
        reservedPendingWei: calculateReservedPendingWei([
          ...result.transactions,
          pending,
        ]).toString(),
      };
      await writeBenchmarkCheckpoint(outputPath, result, forbiddenValues);

      const receipt = await withTimeout(
        broadcast.transaction
          .wait(SEPOLIA_BENCHMARK_CONFIG.receiptConfirmations)
          .then(
            (confirmedReceipt) => confirmedReceipt,
            (waitError: unknown) => {
              return recoverSameHashStatusZeroReceipt<TransactionReceipt>(
                waitError,
                broadcast.transaction.hash
              );
            }
          ),
        SEPOLIA_BENCHMARK_CONFIG.receiptTimeoutMs
      );
      if (!receipt) throw new Error("Transaction receipt is unavailable");
      const receiptMs = performance.now();
      const receiptAtUtc = new Date().toISOString();
      const confirmed = buildConfirmedTransactionRecord({
        operation,
        transactionHash: broadcast.transaction.hash,
        blockNumber: receipt.blockNumber,
        receiptStatus: receipt.status ?? 0,
        gasEstimate: prepared.gasEstimate,
        gasUsed: receipt.gasUsed,
        maxFeePerGasWei,
        maxPriorityFeePerGasWei,
        effectiveGasPriceWei: receipt.gasPrice,
        submittedAtUtc,
        receiptAtUtc,
        startedMs,
        broadcastMs,
        receiptMs,
      });
      const roundWallClockMs = roundKey
        ? receiptMs - (roundStartedAtMs.get(roundKey) ?? startedMs)
        : null;
      result = updateRunningResultAfterReceipt(
        result,
        confirmed,
        roundWallClockMs
      );
      if (confirmed.receiptStatus === 1 && broadcast.deployedContract) {
        const address = receipt.contractAddress;
        if (!address) throw new Error("Deployment receipt did not return an address");
        if (operation.strategy === "individual") {
          individualContract = broadcast.deployedContract;
          result = {
            ...result,
            contractAddresses: { ...result.contractAddresses, individual: address },
          };
        } else {
          merkleContract = broadcast.deployedContract;
          result = {
            ...result,
            contractAddresses: { ...result.contractAddresses, merkle: address },
          };
        }
      }
      await writeBenchmarkCheckpoint(outputPath, result, forbiddenValues);
      if (confirmed.receiptStatus !== 1) {
        throw new Error(`Transaction ${operation.operationId} did not succeed`);
      }
    }

    const balanceAfterWei = await ethers.provider.getBalance(deployer.address);
    result = completeBenchmarkResult(result, balanceAfterWei);
    await writeBenchmarkCheckpoint(outputPath, result, forbiddenValues);
    console.log(
      JSON.stringify(
        {
          seriesId: result.seriesId,
          outputPath,
          contractAddresses: result.contractAddresses,
          totalGasUsed: result.totalGasUsed,
          totalActualFeeWei: result.totalActualFeeWei,
          status: result.status,
        },
        null,
        2
      )
    );
  } catch (error: unknown) {
    const reason = sanitizeErrorMessage(error, forbiddenValues);
    const balanceAfterWei = deployerAddress
      ? await withTimeout(
          ethers.provider.getBalance(deployerAddress),
          30_000
        ).then((balance) => balance, () => null)
      : null;
    if (result && outputPath) {
      result = abortBenchmarkResult(result, reason, balanceAfterWei);
      await writeBenchmarkCheckpoint(outputPath, result, forbiddenValues).then(
        () => undefined,
        (checkpointError: unknown) => {
          console.error(
            sanitizeErrorMessage(checkpointError, forbiddenValues)
          );
        }
      );
    }
    console.error(reason);
    process.exitCode = 1;
  }
}

void main();
