// startAuction.js

"use server";

import { AuctionItem, AuctionStatus } from "@prisma/client";
import * as z from "zod";
import { db } from "@/lib/db";
import { getUserById } from "@/data/user";
import { currentRole, currentUser } from "@/lib/auth";
import { StartAuctionSchema } from "@/schemas";
import { scheduleAuctionClosure } from "@/server/cron";

export const startAuction = async (
  values: z.infer<typeof StartAuctionSchema>
) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  const role = await currentRole();

  if (role !== "ADMIN") {
    return { error: "Unauthorized" };
  }

  const validatedFields = StartAuctionSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Failed to start auction" };
  }

  const auctionItemExists = await db.auctionItem.findFirst({
    where: {
      id: values.itemId,
    },
  });

  if (!auctionItemExists) {
    return { error: "Failed to start auction" };
  }

  if (auctionItemExists.status === AuctionStatus.NOT_STARTED) {
    const auctionItem = await db.auctionItem.update({
      where: {
        id: values.itemId,
      },
      data: {
        startTime: new Date(Date.now()),
        endTime: new Date(Date.now() + 1000 * 60 * 60 * 24),
        status: AuctionStatus.OPEN,
      },
    });

    if (!auctionItem) {
      return { error: "Failed to start auction" };
    }

    // Schedule the closure of the auction
    scheduleAuctionClosure(auctionItem.id);

    return { success: auctionItem };
  } else {
    const auctionItem = await db.auctionItem.update({
      where: {
        id: values.itemId,
      },
      data: {
        endTime: new Date(Date.now() + 1000 * 60 * 60 * 24),
        startTime: new Date(Date.now()),
        currentPrice: auctionItemExists.startingPrice,
        status: AuctionStatus.OPEN,
        lastBidId: null,
      },
    });

    if (!auctionItem) {
      return { error: "Failed to start auction" };
    }

    const bids = await db.bid.deleteMany({
      where: {
        auctionItemId: values.itemId,
      },
    });

    if (!bids) {
      return { error: "Failed to start auction" };
    }

    // Schedule the closure of the auction
    scheduleAuctionClosure(auctionItem.id);

    return { success: auctionItem };
  }
};
