"use server";

import * as z from "zod";

import { unstable_update } from "@/auth";
import { db } from "@/lib/db";
import { SettingsSchema } from "@/schemas";
import { getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";

export const settings = async (values: z.infer<typeof SettingsSchema>) => {
  const user = await currentUser();

  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const dbUser = await getUserById(user.id);

  if (!dbUser) {
    return { error: "Unauthorized" };
  }

  const updatedUser = await db.user.update({
    where: { id: dbUser.id },
    data: {
      ...values,
    },
  });

  if (!updatedUser || !updatedUser.name) {
    return { error: "Failed to update settings" };
  }

  unstable_update({
    user: {
      name: updatedUser.name,
      role: updatedUser.role,
    },
  });

  return { success: "Settings Updated!" };
};
