"use server";

import { db } from "@/lib/db";
import { currentRole, currentUser } from "@/lib/auth";

export interface AccessLogEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  itemId: string;
  itemName: string;
  accessedAt: Date;
}

export const getAccessLog = async (
  limit = 100
): Promise<AccessLogEntry[] | { error: string }> => {
  const user = await currentUser();
  if (!user) return { error: "Unauthorized" };
  const role = await currentRole();
  if (role !== "ADMIN") return { error: "Unauthorized" };

  return db.modelAccess.findMany({
    orderBy: { accessedAt: "desc" },
    take: limit,
  });
};
