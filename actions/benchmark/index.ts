"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";
import { signCanvasUrl } from "@/lib/cloudinary";
import { getOnChainDataDetailed } from "@/lib/blockchain";

export interface BenchmarkItem {
  id: string;
  name: string;
  merkleBatchId: number | null;
}

export interface BenchmarkServerResult {
  proxyPath: string;
  onChainData: { hash: string; timestamp: number } | null;
  blockchainStatus: "registered" | "unregistered" | "unavailable";
  blockchainError: string;
  blockchainQueryDurationMs: number;
}

export interface BenchmarkServerDiagnosticResult {
  signDurationMs: number;
  serverFetchDurationMs: number;
}

/** Returns all items with a 3D model (for the select dropdown) */
export const getBenchmarkItems = async (): Promise<BenchmarkItem[]> => {
  const user = await currentUser();
  if (!user) return [];
  const role = await currentRole();
  if (role !== "ADMIN") return [];

  return db.auctionItem.findMany({
    where: { pathToCanvas: { not: "" } },
    select: { id: true, name: true, merkleBatchId: true },
    orderBy: { createdAt: "desc" },
  });
};

/** Queries the blockchain for the actual online-verification path. */
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

  const blockchainStart = performance.now();
  const lookup = await getOnChainDataDetailed(itemId);
  const blockchainQueryDurationMs = performance.now() - blockchainStart;

  return {
    proxyPath: `/api/model/${itemId}/model.glb`,
    onChainData: lookup.status === "registered" ? lookup.data : null,
    blockchainStatus: lookup.status,
    blockchainError: lookup.status === "unavailable" ? lookup.error : "",
    blockchainQueryDurationMs,
  };
};

/**
 * Runs the direct server→CDN diagnostic after the primary benchmark path so it
 * cannot pre-warm the same run's client→proxy fetch.
 */
export const runServerFetchDiagnostic = async (
  itemId: string
): Promise<BenchmarkServerDiagnosticResult | { error: string }> => {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { pathToCanvas: true },
  });
  if (!item) return { error: "Item not found" };

  const signStart = performance.now();
  const signedUrl = signCanvasUrl(item.pathToCanvas);
  const signDurationMs = performance.now() - signStart;
  const serverFetchStart = performance.now();
  const response = await fetch(signedUrl, { cache: "no-store" });
  if (!response.ok) return { error: `CDN fetch failed with HTTP ${response.status}` };
  await response.arrayBuffer();

  return {
    signDurationMs,
    serverFetchDurationMs: performance.now() - serverFetchStart,
  };
};
