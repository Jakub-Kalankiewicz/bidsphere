"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";
import { signCanvasUrl } from "@/lib/cloudinary";
import { getOnChainData } from "@/lib/blockchain";

export interface BenchmarkItem {
  id: string;
  name: string;
  pathToCanvas: string;
}

export interface BenchmarkServerResult {
  proxyPath: string;
  signDurationMs: number;
  serverFetchDurationMs: number;
  onChainData: { hash: string; timestamp: number } | null;
  blockchainQueryDurationMs: number;
}

/** Returns all items with a 3D model (for the select dropdown) */
export const getBenchmarkItems = async (): Promise<BenchmarkItem[]> => {
  const user = await currentUser();
  if (!user) return [];
  const role = await currentRole();
  if (role !== "ADMIN") return [];

  return db.auctionItem.findMany({
    where: { pathToCanvas: { not: "" } },
    select: { id: true, name: true, pathToCanvas: true },
    orderBy: { createdAt: "desc" },
  });
};

/** Signs the URL and queries the blockchain, returning both values + server-side timing */
export const runServerBenchmark = async (
  itemId: string
): Promise<BenchmarkServerResult | { error: string }> => {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { pathToCanvas: true },
  });

  if (!item) return { error: "Item not found" };

  const signStart = Date.now();
  const signedUrl = signCanvasUrl(item.pathToCanvas);
  const signDurationMs = Date.now() - signStart;

  // Measure server→CDN fetch time (full download, same operation the proxy performs)
  const serverFetchStart = Date.now();
  const cdnResponse = await fetch(signedUrl);
  await cdnResponse.arrayBuffer();
  const serverFetchDurationMs = Date.now() - serverFetchStart;

  const blockchainStart = Date.now();
  const onChainData = await getOnChainData(itemId);
  const blockchainQueryDurationMs = Date.now() - blockchainStart;

  return {
    proxyPath: `/api/model/${itemId}/model.glb`,
    signDurationMs,
    serverFetchDurationMs,
    onChainData,
    blockchainQueryDurationMs,
  };
};
