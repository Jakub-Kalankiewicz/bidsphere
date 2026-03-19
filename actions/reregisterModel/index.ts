"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";
import { registerModelOnChain } from "@/lib/blockchain";

/**
 * Re-registers a model hash on-chain using the hash already stored in MongoDB.
 * Useful when the local Hardhat node resets and existing on-chain records are lost.
 */
export const reregisterModel = async (
  itemId: string
): Promise<{ success: true } | { error: string }> => {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { modelHash: true },
  });

  if (!item) return { error: "Item not found" };
  if (!item.modelHash) return { error: "No hash stored for this item — re-upload to register" };

  const blockchainTxHash = await registerModelOnChain(itemId, item.modelHash);

  await db.auctionItem.update({
    where: { id: itemId },
    data: { blockchainTxHash },
  });

  return { success: true };
};
