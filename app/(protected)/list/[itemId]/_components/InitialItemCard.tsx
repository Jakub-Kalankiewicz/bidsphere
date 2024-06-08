"use client";

import { deleteItem } from "@/actions/deleteItem";
import { startAuction } from "@/actions/startAuction";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AuctionStatus, UserRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import React, { useState, useTransition } from "react";
import { BeatLoader } from "react-spinners";
import { toast } from "sonner";

interface InitialItemCardProps {
  id: string;
  price: number;
  endTime: Date;
  status: AuctionStatus;
  refetchData: () => void;
}

const Status = {
  [AuctionStatus.NOT_STARTED]: {
    label: "Auction not started",
    class: "text-emerald-300",
  },
  [AuctionStatus.CLOSED]: {
    label: "Auction is over",
    class: "text-red-800",
  },
  [AuctionStatus.CANCELED]: {
    label: "Auction was canceled",
    class: "text-red-300",
  },
  [AuctionStatus.OPEN]: {
    label: "Auction is open",
    class: "text-sky-300",
  },
};

const InitialItemCard: React.FC<InitialItemCardProps> = ({
  id,
  price,
  endTime,
  refetchData,
  status,
}: InitialItemCardProps) => {
  const [isPending, startTransition] = useTransition();
  const [auctionStartLoading, setAuctionStartLoading] =
    useState<boolean>(false);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
  const { role } = useCurrentUser();
  const router = useRouter();

  const handleAuctionStart = () => {
    startTransition(() => {
      setAuctionStartLoading(true);
      startAuction({
        itemId: id,
      })
        .then((data) => {
          setAuctionStartLoading(false);
          if (data.error) {
            toast.error(data.error);
            return;
          } else if (data.success) {
            refetchData();
            toast.success("Auction started successfully");
          }
        })
        .catch((error: any) => {
          console.log(error);
          toast.error("Something went wrong!");
        });
    });
  };

  const handleDeleteClick = () => {
    startTransition(() => {
      setDeleteLoading(true);
      deleteItem(id)
        .then((data) => {
          setDeleteLoading(false);
          if (data.error) {
            toast.error(data.error);
            return;
          } else if (data.success) {
            router.push("/list");
            toast.success("Item deleted successfully");
          }
        })
        .catch(() => toast.error("Something went wrong!"));
    });
  };

  const formatedDate = (date: Date) =>
    date.toLocaleDateString() + " " + date.getHours() + ":" + date.getMinutes();

  return (
    <>
      <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-xl">
        Price: <span className="text-sky-300">${price}</span>
      </div>
      <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-md">
        Status:{" "}
        <span className={`${Status[status].class}`}>
          {Status[status].label}
        </span>
      </div>
      {status === AuctionStatus.CLOSED && (
        <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-md">
          Ended: <span className="text-sky-300">{formatedDate(endTime)}</span>
        </div>
      )}
      {role === UserRole.ADMIN && (
        <>
          <hr className="w-full border-t border-sky-200" />
          <p className="text-xl font-semibold">Admin Actions</p>
          <div className="w-full text-center">
            {!auctionStartLoading ? (
              <Button
                variant="primary"
                className="text-white hover:text-black w-full"
                size="xl"
                disabled={auctionStartLoading}
                onClick={handleAuctionStart}
              >
                Start Auction
              </Button>
            ) : (
              <BeatLoader color="#36d7b7" className="mt-3" size={20} />
            )}
          </div>
          <div className=" w-full text-center">
            {!deleteLoading ? (
              <Button
                variant="destructive"
                className="text-white hover:text-black w-full"
                size="xl"
                disabled={deleteLoading}
                onClick={handleDeleteClick}
              >
                Delete Item
              </Button>
            ) : (
              <BeatLoader color="#36d7b7" className="mt-3" size={20} />
            )}
          </div>
        </>
      )}
    </>
  );
};

export default InitialItemCard;
