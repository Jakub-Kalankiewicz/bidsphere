import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";
import type {
  ContractFactory,
  Signer,
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
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
  validateBenchmarkCodeVersion,
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

export interface PaidBenchmarkPreparedOperation {
  gasEstimate: bigint;
  transactionRequest: TransactionRequest;
}

export interface PaidBenchmarkReceipt {
  blockNumber: number;
  status: number | null;
  gasUsed: bigint;
  gasPrice: bigint;
  contractAddress: string | null;
}

export interface PaidBenchmarkCoreDependencies<Response extends { hash: string }> {
  monotonicNow: () => number;
  utcNow: () => string;
  getFeeData: () => Promise<{
    maxFeePerGasWei: bigint | null;
    maxPriorityFeePerGasWei: bigint;
  }>;
  getBalance: (address: string) => Promise<bigint>;
  prepareOperation: (
    operation: BenchmarkOperation,
    addresses: { individual: string | null; merkle: string | null }
  ) => Promise<PaidBenchmarkPreparedOperation>;
  populateTransaction: (request: TransactionRequest) => Promise<TransactionRequest>;
  signer: Pick<Signer, "signTransaction">;
  provider: { broadcastTransaction(signedTransaction: string): Promise<Response> };
  waitForReceipt: (response: Response) => Promise<PaidBenchmarkReceipt | null>;
  checkpoint: (result: SepoliaBenchmarkResult) => Promise<void>;
}

export interface PaidBenchmarkCoreInput {
  operations: readonly BenchmarkOperation[];
  initialResult: SepoliaBenchmarkResult;
  approvedMaximumWei: bigint;
  deployerAddress: string;
}

function benchmarkProviderLabel(value: string | undefined): string | null {
  if (value === undefined) return null;
  const label = value.trim();
  if (!/^[A-Za-z0-9 ._-]{1,80}$/.test(label)) {
    throw new Error("SEPOLIA_BENCHMARK_RPC_PROVIDER_LABEL must be a plain label");
  }
  return label;
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

export async function runPaidBenchmarkCore<Response extends { hash: string }>(
  input: PaidBenchmarkCoreInput,
  dependencies: PaidBenchmarkCoreDependencies<Response>
): Promise<SepoliaBenchmarkResult> {
  const canonicalOperations = buildBenchmarkOperationPlan(
    input.initialResult.seriesId
  );
  if (
    input.operations.length !== 68 ||
    input.initialResult.plannedOperations.length !== 68 ||
    input.operations.some(
      (operation, index) => {
        const canonical = canonicalOperations[index];
        const planned = input.initialResult.plannedOperations[index];
        return (
          operation.operationId !== canonical.operationId ||
          operation.kind !== canonical.kind ||
          operation.strategy !== canonical.strategy ||
          operation.round !== canonical.round ||
          operation.warmup !== canonical.warmup ||
          operation.sequenceInRound !== canonical.sequenceInRound ||
          operation.merkleRoot !== canonical.merkleRoot ||
          operation.gasLimit !== canonical.gasLimit ||
          operation.modelIds.length !== canonical.modelIds.length ||
          operation.modelIds.some(
            (modelId, modelIndex) =>
              modelId !== canonical.modelIds[modelIndex]
          ) ||
          planned.operationId !== canonical.operationId ||
          planned.kind !== canonical.kind ||
          planned.strategy !== canonical.strategy ||
          planned.round !== canonical.round ||
          planned.warmup !== canonical.warmup ||
          planned.sequenceInRound !== canonical.sequenceInRound ||
          planned.merkleRoot !== canonical.merkleRoot ||
          planned.gasLimit !== canonical.gasLimit.toString() ||
          planned.modelIds.length !== canonical.modelIds.length ||
          planned.modelIds.some(
            (modelId, modelIndex) =>
              modelId !== canonical.modelIds[modelIndex]
          )
        );
      }
    )
  ) {
    throw new Error("Paid benchmark operations do not match the initial canonical plan");
  }

  let result = input.initialResult;
  let individualContractAddress = result.contractAddresses.individual;
  let merkleContractAddress = result.contractAddresses.merkle;
  const seriesMonotonicOriginMs = dependencies.monotonicNow();
  await dependencies.checkpoint(result);

  for (const operation of input.operations) {
    const feeData = await dependencies.getFeeData();
    const maxFeePerGasWei = feeData.maxFeePerGasWei;
    if (!maxFeePerGasWei || maxFeePerGasWei <= 0n) {
      throw new Error("RPC did not return a usable maximum fee per gas");
    }
    const maxPriorityFeePerGasWei = feeData.maxPriorityFeePerGasWei;
    if (maxPriorityFeePerGasWei < 0n) {
      throw new Error("RPC returned a negative maximum priority fee per gas");
    }

    const prepared = await dependencies.prepareOperation(operation, {
      individual: individualContractAddress,
      merkle: merkleContractAddress,
    });
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
      approvedMaximumWei: input.approvedMaximumWei,
    });
    const nextWorstCaseWei = operation.gasLimit * maxFeePerGasWei;
    if ((await dependencies.getBalance(input.deployerAddress)) < nextWorstCaseWei) {
      throw new Error("Sepolia wallet balance does not cover the next transaction");
    }

    const startedOffsetMs =
      dependencies.monotonicNow() - seriesMonotonicOriginMs;
    const submittedAtUtc = dependencies.utcNow();
    const populatedTransaction = await dependencies.populateTransaction({
      ...prepared.transactionRequest,
      gasLimit: operation.gasLimit,
      maxFeePerGas: maxFeePerGasWei,
      maxPriorityFeePerGas: maxPriorityFeePerGasWei,
    });
    let pending: BenchmarkTransactionRecord | null = null;
    let broadcastOffsetMs: number | null = null;
    let broadcastAtUtc: string | null = null;
    const broadcast = await persistThenBroadcastTransaction({
      populatedTransaction,
      signer: dependencies.signer,
      provider: dependencies.provider,
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
        result = {
          ...result,
          transactions: [...result.transactions, pending],
          reservedPendingWei: calculateReservedPendingWei([
            ...result.transactions,
            pending,
          ]).toString(),
        };
        await dependencies.checkpoint(result);
      },
      persistAcknowledgement: async (_response, intent) => {
        if (!pending || pending.transactionHash !== intent.transactionHash) {
          throw new Error("Broadcast acknowledgement has no matching intent");
        }
        broadcastOffsetMs =
          dependencies.monotonicNow() - seriesMonotonicOriginMs;
        broadcastAtUtc = dependencies.utcNow();
        pending = acknowledgeTransactionBroadcast(pending, {
          broadcastAtUtc,
          broadcastOffsetMs,
        });
        result = {
          ...result,
          transactions: result.transactions.map((record) =>
            record.operationId === operation.operationId ? pending! : record
          ),
        };
        await dependencies.checkpoint(result);
      },
    });
    if (!pending || broadcastOffsetMs === null || broadcastAtUtc === null) {
      throw new Error("Broadcast acknowledgement is incomplete");
    }
    const acknowledgedPending = result.transactions.find(
      (record) => record.operationId === operation.operationId
    );
    if (!acknowledgedPending?.broadcastAcknowledged) {
      throw new Error("Broadcast acknowledgement is incomplete");
    }

    const receipt = await dependencies.waitForReceipt(broadcast);
    if (!receipt) throw new Error("Transaction receipt is unavailable");
    const receiptOffsetMs =
      dependencies.monotonicNow() - seriesMonotonicOriginMs;
    const receiptAtUtc = dependencies.utcNow();
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
      if (!receipt.contractAddress) {
        throw new Error("Deployment receipt did not return an address");
      }
      if (operation.strategy === "individual") {
        individualContractAddress = receipt.contractAddress;
        result = {
          ...result,
          contractAddresses: {
            ...result.contractAddresses,
            individual: receipt.contractAddress,
          },
        };
      } else {
        merkleContractAddress = receipt.contractAddress;
        result = {
          ...result,
          contractAddresses: {
            ...result.contractAddresses,
            merkle: receipt.contractAddress,
          },
        };
      }
    }
    await dependencies.checkpoint(result);
    if (confirmed.receiptStatus !== 1) {
      throw new Error(`Transaction ${operation.operationId} did not succeed`);
    }
  }

  result = completeBenchmarkResult(
    result,
    await dependencies.getBalance(input.deployerAddress)
  );
  await dependencies.checkpoint(result);
  return result;
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
    const repositoryRoot = resolve(__dirname, "../..");
    const codeVersion = validateBenchmarkCodeVersion(
      process.env.SEPOLIA_BENCHMARK_CODE_VERSION,
      {
        objectType: (identifier) =>
          execFileSync("git", ["cat-file", "-t", identifier], {
            cwd: repositoryRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }),
        headCommit: () =>
          execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
            cwd: repositoryRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }),
      }
    );
    const runtimeNetwork = await ethers.provider.getNetwork();
    assertSepoliaPreflightInputs(network.name, runtimeNetwork.chainId, process.env);
    const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("No Sepolia deployer is configured");
    const deployer = new ethers.Wallet(privateKey, ethers.provider);
    deployerAddress = deployer.address;

    const approvedMaximumWei = parseApprovedMaximumWei(
      process.env.SEPOLIA_BENCHMARK_MAX_COST_WEI
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
    const factory = await ethers.getContractFactory("ModelRegistry", deployer);
    result = await runPaidBenchmarkCore(
      {
        operations,
        initialResult: result,
        approvedMaximumWei,
        deployerAddress: deployer.address,
      },
      {
        monotonicNow: () => performance.now(),
        utcNow: () => new Date().toISOString(),
        getFeeData: async () => {
          const feeData = await ethers.provider.getFeeData();
          return {
            maxFeePerGasWei: feeData.maxFeePerGas ?? feeData.gasPrice,
            maxPriorityFeePerGasWei: feeData.maxPriorityFeePerGas ?? 0n,
          };
        },
        getBalance: (address) => ethers.provider.getBalance(address),
        prepareOperation: (operation, addresses) =>
          prepareOperation(
            operation,
            factory,
            deployer.address,
            addresses.individual,
            addresses.merkle
          ),
        populateTransaction: (request) => deployer.populateTransaction(request),
        signer: deployer,
        provider: ethers.provider,
        waitForReceipt: (broadcast: TransactionResponse) =>
          withTimeout(
            broadcast.wait(SEPOLIA_BENCHMARK_CONFIG.receiptConfirmations).then(
              (receipt) => receipt,
              (waitError: unknown) =>
                recoverSameHashStatusZeroReceipt<TransactionReceipt>(
                  waitError,
                  broadcast.hash
                )
            ),
            SEPOLIA_BENCHMARK_CONFIG.receiptTimeoutMs
          ),
        checkpoint: async (checkpointResult) => {
          result = checkpointResult;
          await writeBenchmarkCheckpoint(
            outputPath!,
            checkpointResult,
            forbiddenValues
          );
        },
      }
    );
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

if (require.main === module) {
  void main();
}
