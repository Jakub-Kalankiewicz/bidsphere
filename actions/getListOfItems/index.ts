"use server";

import { db } from "@/lib/db";
import { getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";
import { AuctionStatus } from "@prisma/client";

export const getListOfItems = async () => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  const items = await db.auctionItem.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      currentPrice: true,
      pathToImage: true,
      status: true,
      endTime: true,
    },
  });

  if (!items) {
    return { error: "Failed to fetch items" };
  }

  const notStarted = items.filter(
    (item) => item.status === AuctionStatus.NOT_STARTED
  );

  const open = items.filter((item) => item.status === AuctionStatus.OPEN);

  const other = items.filter(
    (item) =>
      item.status !== AuctionStatus.OPEN &&
      item.status !== AuctionStatus.NOT_STARTED
  );

  if (!notStarted || !open || !other) {
    return { error: "Failed to fetch items" };
  }

  return {
    success: {
      notStarted,
      open,
      other,
    },
  };
};
