"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";

export const deleteItem = async (value: string) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const role = await currentRole();

  if (role !== "ADMIN") {
    return { error: "Unauthorized" };
  }

  const deletedItem = await db.auctionItem.delete({
    where: {
      id: value,
    },
  });

  if (!deletedItem) {
    return { error: "Failed to delete item" };
  }

  return { success: "Item Deleted!" };
};
