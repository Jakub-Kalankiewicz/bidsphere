import {
  Transaction,
  type Signer,
  type TransactionRequest,
} from "ethers";

export interface PreBroadcastTransactionIntent {
  transactionHash: string;
  nonce: number;
  worstCaseFeeWei: bigint;
}

interface BroadcastResponse {
  hash: string;
}

interface TransactionProvider<Response extends BroadcastResponse> {
  broadcastTransaction(signedTransaction: string): Promise<Response>;
}

export async function persistThenBroadcastTransaction<
  Response extends BroadcastResponse
>(input: {
  populatedTransaction: TransactionRequest;
  signer: Pick<Signer, "signTransaction">;
  provider: TransactionProvider<Response>;
  worstCaseFeeWei: bigint;
  persistIntent: (intent: PreBroadcastTransactionIntent) => Promise<void>;
  persistAcknowledgement: (
    response: Response,
    intent: PreBroadcastTransactionIntent
  ) => Promise<void>;
}): Promise<Response> {
  const signedTransaction = await input.signer.signTransaction(
    input.populatedTransaction
  );
  const transaction = Transaction.from(signedTransaction);
  const transactionHash = transaction.hash;
  if (!transactionHash) {
    throw new Error("Signed transaction did not produce a transaction hash");
  }

  const intent: PreBroadcastTransactionIntent = {
    transactionHash,
    nonce: transaction.nonce,
    worstCaseFeeWei: input.worstCaseFeeWei,
  };
  await input.persistIntent(intent);

  const response = await input.provider.broadcastTransaction(signedTransaction);
  if (response.hash.toLowerCase() !== transactionHash.toLowerCase()) {
    throw new Error("Provider acknowledged a different transaction hash");
  }
  await input.persistAcknowledgement(response, intent);
  return response;
}
