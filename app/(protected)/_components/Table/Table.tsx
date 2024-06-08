"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { columns } from "./columns";
import { DataTable } from "./DataTable";
import { payments } from "./example";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getHistory } from "@/actions/getHistory";
import { toast } from "sonner";
import { HistoryItem } from "../../_types";
import { set } from "zod";

export const Table = () => {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEmpty, setIsEmpty] = useState(false);
  const [data, setData] = useState<HistoryItem[]>();

  useEffect(() => {
    startTransition(() => {
      getHistory().then((res) => {
        if (res.error) {
          toast.error(res.error);
        } else if (res.empty) {
          toast.info(res.empty);
          setIsEmpty(true);
        } else {
          setIsEmpty(false);
          setData(
            res.success?.map((item) => ({
              id: item.id,
              amount: item.amount,
              auctionId: item.auction.id,
              name: item.auction.name,
              description: item.auction.description,
              currentPrice: item.auction.currentPrice,
              pathToImage: item.auction.pathToImage,
              status: item.auction.status,
              endTime: item.auction.endTime,
              isWinning: item.id === item.auction.lastBidId,
              date:
                item.createdAt.toLocaleDateString() +
                " " +
                item.createdAt.toLocaleTimeString(),
            }))
          );
        }
      });
    });
  }, [params]);
  return (
    <div className="container mx-auto py-10">
      {data && !isEmpty ? (
        <DataTable columns={columns} data={data} />
      ) : (
        <div>No history found.</div>
      )}
    </div>
  );
};
