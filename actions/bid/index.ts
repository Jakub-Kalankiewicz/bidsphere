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
    return { error: "Bid amount must be greater than the current price" };
  }

  await db.$transaction(async (tx) => {
    const newBid = await tx.bid.create({
      data: {
        auctionItemId: validatedFields.data.auctionId,
        userId: user.id!,
        amount: validatedFields.data.amount,
      },
    });

    await tx.auctionItem.update({
      where: { id: validatedFields.data.auctionId },
      data: {
        currentPrice: validatedFields.data.amount,
        lastBidId: newBid.id,
      },
    });
  });

  return { success: "Bid placed successfully!" };
};
