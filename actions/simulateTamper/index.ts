"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";

/**
 * Simulates tampering by swapping the item's pathToCanvas to a different model's URL.
 * Saves the original URL in originalPathToCanvas so it can be restored.
 * The on-chain hash remains unchanged, so the next verification will show a mismatch.
 */
export const simulateTamper = async (
  itemId: string
): Promise<{ success: true } | { error: string }> => {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { pathToCanvas: true, originalPathToCanvas: true },
  });

  if (!item) return { error: "Item not found" };
  if (item.originalPathToCanvas) return { error: "Already tampered" };

  // Find any other item with a 3D model to use as the replacement
  const otherItem = await db.auctionItem.findFirst({
    where: { id: { not: itemId }, pathToCanvas: { not: "" } },
    select: { pathToCanvas: true },
  });

  if (!otherItem) return { error: "No other model available for tamper simulation" };

  await db.auctionItem.update({
    where: { id: itemId },
    data: {
      originalPathToCanvas: item.pathToCanvas,
      pathToCanvas: otherItem.pathToCanvas,
    },
  });

  return { success: true };
};

/**
 * Reverts the tamper simulation by restoring the original pathToCanvas.
 */
export const restoreTamper = async (
  itemId: string
): Promise<{ success: true } | { error: string }> => {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };

  const item = await db.auctionItem.findUnique({
    where: { id: itemId },
    select: { originalPathToCanvas: true },
  });

  if (!item) return { error: "Item not found" };
  if (!item.originalPathToCanvas) return { error: "Not tampered" };

  await db.auctionItem.update({
    where: { id: itemId },
    data: {
      pathToCanvas: item.originalPathToCanvas,
      originalPathToCanvas: null,
    },
  });

  return { success: true };
};
