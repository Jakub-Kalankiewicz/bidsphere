"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";

export const cancelAuction = async (value: string) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const role = await currentRole();

  if (role !== "ADMIN") {
    return { error: "Unauthorized" };
  }

  const canceledItem = await db.auctionItem.update({
    where: {
      id: value,
    },
    data: {
      status: "CANCELED",
      endTime: new Date(Date.now()),
    },
  });

  if (!canceledItem) {
    return { error: "Failed to cancel auction" };
  }

  return { success: "Auction Canceled!" };
};
