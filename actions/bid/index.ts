"use server";

import { db } from "@/lib/db";
import { getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";
import { z } from "zod";
import { BidSchema } from "@/schemas";

export const bid = async (values: z.infer<typeof BidSchema>) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  const validatedFields = BidSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Invalid fields!" };
  }

  const auctionItem = await db.auctionItem.findUnique({
    where: {
      id: values.auctionId,
    },
  });

  if (!auctionItem) {
    return { error: "Failed to fetch item" };
  }

  if (validatedFields.data.amount <= auctionItem.currentPrice) {
    return { error: "Bid amount is less or equal the starting price" };
  }

  if (validatedFields.data.amount <= auctionItem.startingPrice) {
    return { error: "Bid amount is less or equal the current price" };
  }

  const bid = await db.bid.create({
    data: {
      auctionItemId: validatedFields.data.auctionId,
      userId: user.id,
      amount: validatedFields.data.amount,
    },
  });

  await db.auctionItem.update({
    where: {
      id: values.auctionId,
    },
    data: {
      currentPrice: validatedFields.data.amount,
      lastBidId: bid.id,
    },
  });

  if (!bid) {
    return { error: "Failed to create bid" };
  }

  return { success: "Succcess" };
};
