"use server";

import { db } from "@/lib/db";
import { getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";
import { AuctionStatus } from "@prisma/client";

export const getNewestItems = async () => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  const items = await db.auctionItem.findMany({
    where: {
      status: AuctionStatus.NOT_STARTED || AuctionStatus.OPEN,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      description: true,
      currentPrice: true,
      pathToImage: true,
      status: true,
      endTime: true,
    },
    take: 5,
  });

  if (!items) {
    return { error: "Failed to fetch items" };
  }

  return { success: items };
};
