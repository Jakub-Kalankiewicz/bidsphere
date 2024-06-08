"use server";

import { getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const getHistory = async () => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  const history = await db.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      bids: {
        select: {
          id: true,
          amount: true,
          createdAt: true,
          auction: {
            select: {
              id: true,
              name: true,
              description: true,
              currentPrice: true,
              pathToImage: true,
              status: true,
              endTime: true,
              lastBidId: true,
            },
          },
        },
      },
    },
  });

  if (!history) {
    return { error: "Failed to fetch history" };
  }

  if (!history.bids.length) {
    return { empty: "No history found" };
  }

  return {
    success: [...history.bids],
  };
};
