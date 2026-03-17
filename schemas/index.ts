import * as z from "zod";
import { UserRole } from "@prisma/client";

export const SettingsSchema = z.object({
  name: z.optional(z.string()),
  role: z.enum([UserRole.ADMIN, UserRole.USER]),
});

export const AdminSchema = z.object({
  name: z
    .string()
    .min(3, { message: "Name must be at least 3 characters long" })
    .max(255, { message: "Name must be at most 255 characters long" }),
  startingPrice: z.coerce
    .number()
    .min(1, { message: "Price must be at least 1" })
    .max(1000000, { message: "Price must be at most 1000000" }),
  pathToImage: z.string().min(1, { message: "Path to image is required" }),
  pathToCanvas: z.string().min(1, { message: "Path to canvas is required" }),
  description: z
    .string()
    .min(3, { message: "Description must be at least 3 characters long" }),
});

export const GetItemSchema = z.object({
  id: z.string(),
});

export const StartAuctionSchema = z.object({
  itemId: z.string(),
});

export const BidSchema = z.object({
  amount: z.coerce.number().min(1, { message: "Amount must be at least 1" }),
  auctionId: z.string(),
});
