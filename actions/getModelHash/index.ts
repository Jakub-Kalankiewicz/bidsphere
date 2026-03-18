"use server";

import { currentUser } from "@/lib/auth";
import { getOnChainData } from "@/lib/blockchain";

export type ModelHashResult =
  | { status: "verified"; onChainHash: string; timestamp: number }
  | { status: "not_registered" }
  | { status: "unavailable" };

export const getModelHash = async (
  auctionItemId: string
): Promise<ModelHashResult> => {
  const user = await currentUser();
  if (!user) return { status: "unavailable" };

  const data = await getOnChainData(auctionItemId);

  if (data === null) return { status: "not_registered" };

  return { status: "verified", onChainHash: data.hash, timestamp: data.timestamp };
};
