"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { buildMerkleTree, generateProof } from "@/lib/merkle";

export interface ProofBundle {
  modelId: string;
  modelName: string;
  fileHash: string;
  batchId: number;
  merkleRoot: string;
  merkleProof: string[];
  leafIndex: number;
  totalLeaves: number; // unpadded real leaf count — required for the pad-zone guard
  registeredAt: number;
  chainId: number;
  contractAddress: string;
}

export async function generateMerkleProof(
  itemId: string
): Promise<ProofBundle | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { name: true, modelHash: true, merkleBatchId: true },
  });

  if (!item) return { error: "Item not found" };
  if (!item.merkleBatchId) return { error: "Item has not been added to a Merkle batch yet" };
  if (!item.modelHash) return { error: "Item has no stored model hash" };

  const batch = await db.merkleBatch.findUnique({
    where: { batchId: item.merkleBatchId },
  });

  if (!batch) return { error: "Batch record not found in database" };

  const leafIndex = batch.modelIds.indexOf(itemId);
  if (leafIndex === -1) return { error: "Item not found in batch leaf list" };

  // Reject a proof target that falls in the duplicated padding zone.
  // batch.modelIds.length is the unpadded real count; indices >= this are ghost entries.
  if (leafIndex >= batch.modelIds.length) {
    return { error: "leafIndex is out of range for real leaves (pad-zone attack rejected)" };
  }

  const tree = buildMerkleTree(batch.leaves);
  const { proof } = generateProof(tree, leafIndex); // generateProof also throws for pad-zone index

  return {
    modelId: itemId,
    modelName: item.name,
    fileHash: item.modelHash,
    batchId: item.merkleBatchId,
    merkleRoot: batch.root,
    merkleProof: proof,
    leafIndex,
    totalLeaves: batch.modelIds.length,
    registeredAt: Math.floor(batch.createdAt.getTime() / 1000),
    chainId: 11155111, // Sepolia
    contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS ?? "",
  };
}
