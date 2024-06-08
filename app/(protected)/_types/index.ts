import { AuctionStatus } from "@prisma/client";

export interface Item {
  id: string;
  name: string;
  description: string;
  currentPrice: number;
  pathToImage: string;
  status: string;
  endTime: Date | null;
}

export interface AuctionItem {
  id: string;
  name: string;
  startingPrice: number;
  currentPrice: number;
  pathToCanvas: string;
  description: string;
  createdAt: Date;
  status: AuctionStatus;
  startTime: Date | null;
  endTime: Date | null;
  lastBidId: string | null;
}

export interface LastBidderType {
  amount: number;
  user: {
    id: string;
    email: string | null;
  };
}

export interface HistoryItem {
  id: string;
  amount: number;
  auctionId: string;
  name: string;
  description: string;
  currentPrice: number;
  pathToImage: string;
  status: AuctionStatus;
  endTime: Date | null;
  date: string;
  isWinning: boolean;
}
