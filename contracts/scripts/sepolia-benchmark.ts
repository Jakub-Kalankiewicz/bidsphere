import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";
import type {
  ContractFactory,
  TransactionReceipt,
  TransactionRequest,
} from "ethers";

import { writeBenchmarkCheckpoint } from "./sepolia-benchmark-checkpoint";
import {
  SEPOLIA_BENCHMARK_CONFIG,
  acknowledgeTransactionBroadcast,
  abortBenchmarkResult,
  aggregateRound,
  assertNextTransactionWithinBudget,
  buildBenchmarkOperationPlan,
  buildConfirmedTransactionRecord,
  buildPreBroadcastTransactionRecord,
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
import { persistThenBroadcastTransaction } from "./sepolia-benchmark-transaction";
import {
  assertGasEstimateWithinLimit,
  assertSepoliaPreflightInputs,
} from "./sepolia-smoke-helpers";

interface PreparedOperation {
  gasEstimate: bigint;
  transactionRequest: TransactionRequest;
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

function updateRunningResultAfterReceipt(
  result: SepoliaBenchmarkResult,
  confirmed: BenchmarkTransactionRecord
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
    const aggregate = derivedAggregate;
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
  individualContractAddress: string | null,
  merkleContractAddress: string | null
): Promise<PreparedOperation> {
  if (operation.kind === "deployment") {
    const deploymentRequest = await factory.getDeployTransaction();
    const gasEstimate = await ethers.provider.estimateGas({
      ...deploymentRequest,
      from: deployerAddress,
    });
    return {
      gasEstimate,
      transactionRequest: deploymentRequest,
    };
  }

  if (operation.kind === "individual-registration") {
    if (!individualContractAddress || operation.modelIds.length !== 1) {
      throw new Error("Individual contract is unavailable for registration");
    }
    const modelId = operation.modelIds[0];
    const modelHash = ethers.keccak256(ethers.toUtf8Bytes(modelId));
    const transactionRequest = {
      to: individualContractAddress,
      data: factory.interface.encodeFunctionData("registerModel", [
        modelId,
        modelHash,
      ]),
    };
    const gasEstimate = await ethers.provider.estimateGas({
      ...transactionRequest,
      from: deployerAddress,
    });
    return {
      gasEstimate,
      transactionRequest,
    };
  }

  if (!merkleContractAddress || !operation.merkleRoot) {
    throw new Error("Merkle contract is unavailable for registration");
  }
  const transactionRequest = {
    to: merkleContractAddress,
    data: factory.interface.encodeFunctionData("registerMerkleRoot", [
      operation.merkleRoot,
      operation.modelIds,
    ]),
  };
  const gasEstimate = await ethers.provider.estimateGas({
    ...transactionRequest,
    from: deployerAddress,
  });
  return {
    gasEstimate,
    transactionRequest,
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
    const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("No Sepolia deployer is configured");
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
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
    const seriesMonotonicOriginMs = performance.now();
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
    let individualContractAddress: string | null = null;
    let merkleContractAddress: string | null = null;

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
        individualContractAddress,
        merkleContractAddress
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
      const startedOffsetMs = performance.now() - seriesMonotonicOriginMs;
      const submittedAtUtc = new Date().toISOString();
      const populatedTransaction = await deployer.populateTransaction({
        ...prepared.transactionRequest,
        ...overrides,
      });
      let pending: BenchmarkTransactionRecord | null = null;
      let broadcastOffsetMs: number | null = null;
      let broadcastAtUtc: string | null = null;
      const broadcast = await persistThenBroadcastTransaction({
        populatedTransaction,
        signer: deployer,
        provider: ethers.provider,
        worstCaseFeeWei: nextWorstCaseWei,
        persistIntent: async (intent) => {
          if (intent.worstCaseFeeWei !== nextWorstCaseWei) {
            throw new Error("Pre-broadcast reservation does not match the budget gate");
          }
          pending = buildPreBroadcastTransactionRecord({
            operation,
            transactionHash: intent.transactionHash,
            nonce: intent.nonce,
            gasEstimate: prepared.gasEstimate,
            maxFeePerGasWei,
            maxPriorityFeePerGasWei,
            submittedAtUtc,
            startedOffsetMs,
          });
          const checkpointResult = result as SepoliaBenchmarkResult;
          result = {
            ...checkpointResult,
            transactions: [...checkpointResult.transactions, pending],
            reservedPendingWei: calculateReservedPendingWei([
              ...checkpointResult.transactions,
              pending,
            ]).toString(),
          };
          await writeBenchmarkCheckpoint(
            outputPath!,
            result as SepoliaBenchmarkResult,
            forbiddenValues
          );
        },
        persistAcknowledgement: async (_response, intent) => {
          if (!pending || pending.transactionHash !== intent.transactionHash) {
            throw new Error("Broadcast acknowledgement has no matching intent");
          }
          broadcastOffsetMs = performance.now() - seriesMonotonicOriginMs;
          broadcastAtUtc = new Date().toISOString();
          pending = acknowledgeTransactionBroadcast(pending, {
            broadcastAtUtc,
            broadcastOffsetMs,
          });
          const checkpointResult = result as SepoliaBenchmarkResult;
          result = {
            ...checkpointResult,
            transactions: checkpointResult.transactions.map((record) =>
              record.operationId === operation.operationId ? pending! : record
            ),
          };
          await writeBenchmarkCheckpoint(
            outputPath!,
            result as SepoliaBenchmarkResult,
            forbiddenValues
          );
        },
      });
      if (!pending || broadcastOffsetMs === null || broadcastAtUtc === null) {
        throw new Error("Broadcast acknowledgement is incomplete");
      }
      const acknowledgedPending = (
        result as SepoliaBenchmarkResult
      ).transactions.find(
        (record) => record.operationId === operation.operationId
      );
      if (!acknowledgedPending?.broadcastAcknowledged) {
        throw new Error("Broadcast acknowledgement is incomplete");
      }

      const receipt = await withTimeout(
        broadcast
          .wait(SEPOLIA_BENCHMARK_CONFIG.receiptConfirmations)
          .then(
            (confirmedReceipt) => confirmedReceipt,
            (waitError: unknown) => {
              return recoverSameHashStatusZeroReceipt<TransactionReceipt>(
                waitError,
                broadcast.hash
              );
            }
          ),
        SEPOLIA_BENCHMARK_CONFIG.receiptTimeoutMs
      );
      if (!receipt) throw new Error("Transaction receipt is unavailable");
      const receiptOffsetMs = performance.now() - seriesMonotonicOriginMs;
      const receiptAtUtc = new Date().toISOString();
      const confirmed = buildConfirmedTransactionRecord({
        operation,
        transactionHash: broadcast.hash,
        nonce: acknowledgedPending.nonce,
        blockNumber: receipt.blockNumber,
        receiptStatus: receipt.status ?? 0,
        gasEstimate: prepared.gasEstimate,
        gasUsed: receipt.gasUsed,
        maxFeePerGasWei,
        maxPriorityFeePerGasWei,
        effectiveGasPriceWei: receipt.gasPrice,
        submittedAtUtc,
        broadcastAtUtc,
        receiptAtUtc,
        startedOffsetMs,
        broadcastOffsetMs,
        receiptOffsetMs,
      });
      result = updateRunningResultAfterReceipt(result, confirmed);
      if (confirmed.receiptStatus === 1 && operation.kind === "deployment") {
        const address = receipt.contractAddress;
        if (!address) throw new Error("Deployment receipt did not return an address");
        if (operation.strategy === "individual") {
          individualContractAddress = address;
          result = {
            ...result,
            contractAddresses: { ...result.contractAddresses, individual: address },
          };
        } else {
          merkleContractAddress = address;
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
