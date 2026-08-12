import assert from "node:assert/strict";

import { Transaction, Wallet, type TransactionRequest } from "ethers";

import {
  runPaidBenchmarkCore,
  type PaidBenchmarkCoreDependencies,
} from "../scripts/sepolia-benchmark";
import {
  buildBenchmarkOperationPlan,
  createInitialBenchmarkResult,
  type SepoliaBenchmarkResult,
} from "../scripts/sepolia-benchmark-helpers";

const wallet = Wallet.fromPhrase(
  "test test test test test test test test test test test junk"
);
const individualAddress = "0x1111111111111111111111111111111111111111";
const merkleAddress = "0x2222222222222222222222222222222222222222";

function fixture() {
  const operations = buildBenchmarkOperationPlan("series-runner-integration");
  const initialResult = createInitialBenchmarkResult(
    {
      seriesId: "series-runner-integration",
      startedAtUtc: "2026-08-12T10:00:00.000Z",
      rpcProviderLabel: "test provider",
      codeVersion: "0123456789abcdef0123456789abcdef01234567",
      deployerAddress: wallet.address,
      approvedMaximumWei: 100_000_000n,
      balanceBeforeWei: 100_000_000n,
      runtime: { node: "v24.0.0", hardhat: "2.28.6" },
    },
    operations
  );
  const checkpoints: SepoliaBenchmarkResult[] = [];
  const prepared: string[] = [];
  const signedTransactions: Transaction[] = [];
  let feeRequests = 0;
  let balanceRequests = 0;
  let nonce = 20;
  let monotonicMs = 0;
  let utcMs = Date.parse("2026-08-12T10:00:00.000Z");

  const dependencies: PaidBenchmarkCoreDependencies<{ hash: string; index: number }> = {
    monotonicNow: () => {
      monotonicMs += 5;
      return monotonicMs;
    },
    utcNow: () => new Date((utcMs += 10)).toISOString(),
    getFeeData: async () => {
      feeRequests += 1;
      return { maxFeePerGasWei: 3n, maxPriorityFeePerGasWei: 1n };
    },
    getBalance: async () => {
      balanceRequests += 1;
      return 100_000_000n;
    },
    prepareOperation: async (operation, addresses) => {
      prepared.push(operation.operationId);
      if (operation.kind === "individual-registration") {
        assert.equal(addresses.individual, individualAddress);
      }
      if (operation.kind === "merkle-registration") {
        assert.equal(addresses.merkle, merkleAddress);
      }
      return {
        gasEstimate: operation.gasLimit - 1n,
        transactionRequest: {
          to:
            operation.kind === "deployment"
              ? undefined
              : operation.strategy === "individual"
                ? individualAddress
                : merkleAddress,
          data: operation.kind === "deployment" ? "0x6000" : "0x1234",
        },
      };
    },
    populateTransaction: async (request: TransactionRequest) => ({
      ...request,
      chainId: 11_155_111,
      type: 2,
      nonce: nonce++,
    }),
    signer: wallet,
    provider: {
      broadcastTransaction: async (signedTransaction) => {
        const transaction = Transaction.from(signedTransaction);
        signedTransactions.push(transaction);
        return { hash: transaction.hash!, index: signedTransactions.length - 1 };
      },
    },
    waitForReceipt: async (response) => ({
      blockNumber: 1_000 + response.index,
      status: 1,
      gasUsed: 100n,
      gasPrice: 2n,
      contractAddress:
        response.index === 0
          ? individualAddress
          : response.index === 1
            ? merkleAddress
            : null,
    }),
    checkpoint: async (result) => {
      checkpoints.push(structuredClone(result));
    },
  };

  return {
    operations,
    initialResult,
    dependencies,
    checkpoints,
    prepared,
    signedTransactions,
    feeRequests: () => feeRequests,
    balanceRequests: () => balanceRequests,
  };
}

it("orchestrates the canonical paid sequence through intent, acknowledgement, receipt, and completion checkpoints", async () => {
  const context = fixture();

  const completed = await runPaidBenchmarkCore(
    {
      operations: context.operations,
      initialResult: context.initialResult,
      approvedMaximumWei: 100_000_000n,
      deployerAddress: wallet.address,
    },
    context.dependencies
  );

  assert.deepEqual(
    context.prepared,
    context.operations.map((operation) => operation.operationId)
  );
  assert.equal(context.signedTransactions.length, 68);
  assert.equal(context.feeRequests(), 68);
  assert.equal(context.balanceRequests(), 69);
  assert.deepEqual(
    context.signedTransactions.map((transaction) => transaction.gasLimit),
    context.operations.map((operation) => operation.gasLimit)
  );
  assert.equal(context.checkpoints.length, 206);
  assert.equal(context.checkpoints[0].transactions.length, 0);
  assert.deepEqual(
    context.checkpoints.slice(1, 4).map((checkpoint) => ({
      status: checkpoint.transactions[0].status,
      acknowledged: checkpoint.transactions[0].broadcastAcknowledged,
    })),
    [
      { status: "pending", acknowledged: false },
      { status: "pending", acknowledged: true },
      { status: "confirmed", acknowledged: true },
    ]
  );
  assert.equal(completed.status, "completed");
  assert.equal(completed.transactions.length, 68);
  assert.equal(completed.rounds.length, 12);
  assert.equal(completed.contractAddresses.individual, individualAddress);
  assert.equal(completed.contractAddresses.merkle, merkleAddress);
  assert.equal(context.checkpoints.at(-1)?.status, "completed");
});

it("does not retry or prepare a later operation when acknowledgement checkpointing fails after broadcast", async () => {
  const context = fixture();
  let acknowledgementAttempted = false;
  context.dependencies.checkpoint = async (result) => {
    const first = result.transactions[0];
    if (first?.status === "pending" && first.broadcastAcknowledged) {
      acknowledgementAttempted = true;
      throw new Error("acknowledgement checkpoint failed");
    }
    context.checkpoints.push(structuredClone(result));
  };

  await assert.rejects(
    runPaidBenchmarkCore(
      {
        operations: context.operations,
        initialResult: context.initialResult,
        approvedMaximumWei: 100_000_000n,
        deployerAddress: wallet.address,
      },
      context.dependencies
    ),
    /acknowledgement checkpoint failed/
  );

  assert.equal(acknowledgementAttempted, true);
  assert.equal(context.signedTransactions.length, 1);
  assert.deepEqual(context.prepared, ["deployment:individual"]);
  assert.equal(context.checkpoints.at(-1)?.transactions[0].broadcastAcknowledged, false);
});
