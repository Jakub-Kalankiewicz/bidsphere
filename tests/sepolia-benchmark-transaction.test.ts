import assert from "node:assert/strict";
import test from "node:test";

import { Wallet, type TransactionRequest } from "ethers";

import {
  persistThenBroadcastTransaction,
  type PreBroadcastTransactionIntent,
} from "../contracts/scripts/sepolia-benchmark-transaction.ts";

const wallet = Wallet.fromPhrase(
  "test test test test test test test test test test test junk"
);

const deploymentRequest: TransactionRequest = {
  type: 2,
  chainId: 11_155_111n,
  nonce: 7,
  gasLimit: 1_500_000n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  data: "0x60006000f3",
};

const contractCallRequest: TransactionRequest = {
  type: 2,
  chainId: 11_155_111n,
  nonce: 8,
  gasLimit: 150_000n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  to: "0x1111111111111111111111111111111111111111",
  data: "0x12345678",
};

const expectedDeployment = {
  signedTransaction:
    "0x02f85f83aa36a707843b9aca0084773594008316e36080808560006000f3c001a09ec0e10bff7a5ab894ced5546a5247efe830f6bf04d914b634262a86e9c46225a07b1b066d80d424335d658e2fe5891fa553d36038208c86a10817688821f645e2",
  transactionHash:
    "0xcd40cdaa0b2f4597e93c52cecee79e202493c5daec873700cbf8f7a8b4884e8c",
};

const expectedContractCall = {
  signedTransaction:
    "0x02f87283aa36a708843b9aca008477359400830249f0941111111111111111111111111111111111111111808412345678c001a0e4d2a5e7fc1819370e41664be778b9179d37dee7f5511c096c4aa07a490fc251a065047e68fcf07e6dad9fdbde7e4d97ae9a4cba290589b8cbbc827686978881bc",
  transactionHash:
    "0x7eed3599b7db987512326d1509cab46172276a57938848e2d67e4fa1fb15dd07",
};

for (const fixture of [
  {
    name: "deployment",
    request: deploymentRequest,
    expected: expectedDeployment,
    worstCaseFeeWei: 3_000_000_000_000_000n,
  },
  {
    name: "contract call",
    request: contractCallRequest,
    expected: expectedContractCall,
    worstCaseFeeWei: 300_000_000_000_000n,
  },
] as const) {
  test(`persists the exact ${fixture.name} intent before one provider broadcast`, async () => {
    const events: string[] = [];
    let persistedIntent: PreBroadcastTransactionIntent | null = null;
    let acknowledgedIntent: PreBroadcastTransactionIntent | null = null;

    const result = await persistThenBroadcastTransaction({
      populatedTransaction: fixture.request,
      signer: wallet,
      provider: {
        broadcastTransaction: async (signedTransaction) => {
          events.push("broadcast");
          assert.equal(signedTransaction, fixture.expected.signedTransaction);
          return { hash: fixture.expected.transactionHash, marker: fixture.name };
        },
      },
      worstCaseFeeWei: fixture.worstCaseFeeWei,
      persistIntent: async (intent) => {
        events.push("intent");
        persistedIntent = intent;
      },
      persistAcknowledgement: async (_response, intent) => {
        events.push("acknowledgement");
        acknowledgedIntent = intent;
      },
    });

    assert.deepEqual(events, ["intent", "broadcast", "acknowledgement"]);
    assert.deepEqual(persistedIntent, {
      transactionHash: fixture.expected.transactionHash,
      nonce: fixture.request.nonce,
      worstCaseFeeWei: fixture.worstCaseFeeWei,
    });
    assert.deepEqual(acknowledgedIntent, persistedIntent);
    assert.equal(result.hash, fixture.expected.transactionHash);
  });
}

test("does not broadcast when the pre-broadcast checkpoint fails", async () => {
  let broadcasts = 0;

  await assert.rejects(
    persistThenBroadcastTransaction({
      populatedTransaction: contractCallRequest,
      signer: wallet,
      provider: {
        broadcastTransaction: async () => {
          broadcasts += 1;
          return { hash: expectedContractCall.transactionHash };
        },
      },
      worstCaseFeeWei: 300_000_000_000_000n,
      persistIntent: async () => {
        throw new Error("checkpoint unavailable");
      },
      persistAcknowledgement: async () => undefined,
    }),
    /checkpoint unavailable/
  );

  assert.equal(broadcasts, 0);
});

test("retains the pre-broadcast evidence and never retries after response loss", async () => {
  const intents: PreBroadcastTransactionIntent[] = [];
  let broadcasts = 0;

  await assert.rejects(
    persistThenBroadcastTransaction({
      populatedTransaction: contractCallRequest,
      signer: wallet,
      provider: {
        broadcastTransaction: async () => {
          broadcasts += 1;
          throw new Error("RPC response lost");
        },
      },
      worstCaseFeeWei: 300_000_000_000_000n,
      persistIntent: async (intent) => {
        intents.push(intent);
      },
      persistAcknowledgement: async () => {
        assert.fail("a lost response cannot be acknowledged");
      },
    }),
    /RPC response lost/
  );

  assert.equal(broadcasts, 1);
  assert.deepEqual(intents, [
    {
      transactionHash: expectedContractCall.transactionHash,
      nonce: 8,
      worstCaseFeeWei: 300_000_000_000_000n,
    },
  ]);
});

test("never rebroadcasts when acknowledgement checkpointing fails", async () => {
  const events: string[] = [];

  await assert.rejects(
    persistThenBroadcastTransaction({
      populatedTransaction: contractCallRequest,
      signer: wallet,
      provider: {
        broadcastTransaction: async () => {
          events.push("broadcast");
          return { hash: expectedContractCall.transactionHash };
        },
      },
      worstCaseFeeWei: 300_000_000_000_000n,
      persistIntent: async () => {
        events.push("intent");
      },
      persistAcknowledgement: async () => {
        events.push("acknowledgement");
        throw new Error("checkpoint write failed");
      },
    }),
    /checkpoint write failed/
  );

  assert.deepEqual(events, ["intent", "broadcast", "acknowledgement"]);
});

test("rejects a provider response for a different transaction without retrying", async () => {
  let broadcasts = 0;

  await assert.rejects(
    persistThenBroadcastTransaction({
      populatedTransaction: contractCallRequest,
      signer: wallet,
      provider: {
        broadcastTransaction: async () => {
          broadcasts += 1;
          return { hash: expectedDeployment.transactionHash };
        },
      },
      worstCaseFeeWei: 300_000_000_000_000n,
      persistIntent: async () => undefined,
      persistAcknowledgement: async () => {
        assert.fail("a mismatched response cannot be acknowledged");
      },
    }),
    /different transaction hash/
  );

  assert.equal(broadcasts, 1);
});
