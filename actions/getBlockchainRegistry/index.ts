"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";
import { getOnChainData } from "@/lib/blockchain";

export interface RegistryEntry {
  id: string;
  name: string;
  modelHash: string | null;
  blockchainTxHash: string | null;
  isTampered: boolean;
  onChainHash: string | null;
  registeredAt: Date | null;
}

export const getBlockchainRegistry = async (): Promise<
  RegistryEntry[] | { error: string }
> => {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };

  const items = await db.auctionItem.findMany({
    select: {
      id: true,
      name: true,
      modelHash: true,
      blockchainTxHash: true,
      originalPathToCanvas: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const entries: RegistryEntry[] = await Promise.all(
    items.map(async (item) => {
      const onChain = await getOnChainData(item.id);
      return {
        id: item.id,
        name: item.name,
        modelHash: item.modelHash,
        blockchainTxHash: item.blockchainTxHash,
        isTampered: item.originalPathToCanvas !== null,
        onChainHash: onChain?.hash ?? null,
        registeredAt: onChain ? new Date(onChain.timestamp * 1000) : null,
      };
    })
  );

  return entries;
};
