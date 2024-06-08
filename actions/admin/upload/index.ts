"use server";

import * as z from "zod";
import { db } from "@/lib/db";
import { AdminSchema } from "@/schemas";
import { currentRole, currentUser } from "@/lib/auth";

export const adminUpload = async (values: z.infer<typeof AdminSchema>) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const role = await currentRole();

  if (role !== "ADMIN") {
    return { error: "Unauthorized" };
  }

  const validatedFields = AdminSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Invalid fields!" };
  }

  const newItem = await db.auctionItem.create({
    data: {
      ...values,
      currentPrice: values.startingPrice,
    },
  });

  if (!newItem || !newItem.name) {
    return { error: "Failed to create item" };
  }

  return { success: "New Item Created!" };
};
