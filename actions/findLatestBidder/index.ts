"use server";

import { db } from "@/lib/db";
import { getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";

export const findLatestBidder = async (lastBidId: string | null) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  if (!lastBidId) {
    return { success: null };
  }

  const bidder = await db.bid.findUnique({
    where: {
      id: lastBidId,
    },
    select: {
      amount: true,
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  if (!bidder) {
    return { error: "Failed to fetch bidder" };
  }

  return { success: bidder };
};
