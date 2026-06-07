"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";
import { buildMerkleTree } from "@/lib/merkle";
import { registerMerkleRootOnChain } from "@/lib/blockchain";

export interface BatchRegisterResult {
  batchId: number;
  root: string;
  txHash: string;
  modelCount: number;
}

export async function batchRegister(
  itemIds: string[]
): Promise<BatchRegisterResult | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };
  if (itemIds.length === 0) return { error: "No items selected" };

  const items = await db.auctionItem.findMany({
    where: { id: { in: itemIds }, modelHash: { not: null } },
    select: { id: true, modelHash: true },
    orderBy: { createdAt: "asc" },
  });

  if (items.length === 0) return { error: "None of the selected items have a stored model hash" };

  // Build leaves in stable order (DB createdAt asc) so proofs are reproducible
  const orderedIds = items.map((i) => i.id);
  const leaves = items.map((i) => i.modelHash as string);

  const tree = buildMerkleTree(leaves);

  const txHash = await registerMerkleRootOnChain(tree.root, orderedIds);

  // Get the new batchId — read from DB count after insert
  const existingBatches = await db.merkleBatch.count();
  const newBatchId = existingBatches + 1;

  await db.merkleBatch.create({
    data: {
      batchId: newBatchId,
      root: tree.root,
      modelIds: orderedIds,
      leaves: tree.leaves, // padded, as used by generateProof
      txHash,
    },
  });

  await db.auctionItem.updateMany({
    where: { id: { in: orderedIds } },
    data: { merkleBatchId: newBatchId },
  });

  return { batchId: newBatchId, root: tree.root, txHash, modelCount: orderedIds.length };
}

/** Returns items that have a modelHash but no merkleBatchId — candidates for batching. */
export async function getPendingBatchItems() {
  const user = await currentUser();
  if (!user) return [];
  const role = await currentRole();
  if (role !== "ADMIN") return [];

  return db.auctionItem.findMany({
    where: { modelHash: { not: null }, merkleBatchId: null },
    select: { id: true, name: true, modelHash: true },
    orderBy: { createdAt: "asc" },
  });
}
