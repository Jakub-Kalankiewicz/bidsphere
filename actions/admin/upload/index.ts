"use server";

import * as z from "zod";
import { db } from "@/lib/db";
import { AdminSchema } from "@/schemas";
import { currentRole, currentUser } from "@/lib/auth";
import { computeModelHash, registerModelOnChain } from "@/lib/blockchain";

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

  // Register model hash on blockchain (non-blocking for item creation)
  try {
    const modelHash = await computeModelHash(values.pathToCanvas);
    const blockchainTxHash = await registerModelOnChain(newItem.id, modelHash);
    await db.auctionItem.update({
      where: { id: newItem.id },
      data: { modelHash, blockchainTxHash },
    });
  } catch (error) {
    console.error("[blockchain] Failed to register model hash:", error);
  }

  return { success: "New Item Created!" };
};
