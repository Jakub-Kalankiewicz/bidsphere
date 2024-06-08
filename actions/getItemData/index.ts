"use server";

import * as z from "zod";
import { db } from "@/lib/db";
import { getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";
import { GetItemSchema } from "@/schemas";

export const getItemData = async (values: z.infer<typeof GetItemSchema>) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  const validatedFields = GetItemSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Invalid fields!" };
  }

  if (validatedFields.data.id.length !== 24) {
    return { error: "Invalid ID!" };
  }

  const item = await db.auctionItem.findUnique({
    where: {
      id: validatedFields.data.id,
    },
    select: {
      id: true,
      name: true,
      description: true,
      currentPrice: true,
      startingPrice: true,
      pathToCanvas: true,
      createdAt: true,
      status: true,
      startTime: true,
      endTime: true,
      lastBidId: true,
    },
  });

  if (!item) {
    return { error: "Failed to fetch item" };
  }

  return { success: item };
};
