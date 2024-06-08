"use client";

import * as z from "zod";

import { findLatestBidder } from "@/actions/findLatestBidder";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { BeatLoader } from "react-spinners";
import { BidSchema } from "@/schemas";
import { toast } from "sonner";
import { bid } from "@/actions/bid";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { UserRole } from "@prisma/client";
import { AuctionItem, LastBidderType } from "@/app/(protected)/_types";
import Form from "./Form";
import { Button } from "@/components/ui/button";
import { cancelAuction } from "@/actions/cancelAuction";

interface AuctionItemCardProps {
  auctionItem: AuctionItem;
  refetchData: () => void;
}

const AuctionItemCard = ({
  auctionItem: { id, currentPrice, startTime, endTime, status, lastBidId },
  refetchData,
}: AuctionItemCardProps) => {
  const { user, role } = useCurrentUser();
  const [isPending, startTransition] = useTransition();
  const [lastBidderLoading, setLastBidderLoading] = useState(false);
  const [biddingLoading, setBiddingLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [lastBid, setLastBid] = useState<LastBidderType | null>();

  const form = useForm<z.infer<typeof BidSchema>>({
    resolver: zodResolver(BidSchema),
    defaultValues: {
      amount: currentPrice,
      auctionId: id,
    },
  });

  useEffect(() => {
    const fetchData = () => {
      startTransition(() => {
        setLastBidderLoading(true);
        findLatestBidder(lastBidId)
          .then((data) => {
            setLastBidderLoading(false);
            if (data.error) {
              toast.error(data.error);
              return;
            } else if (data.success) {
              setLastBid(data.success);
            }
          })
          .catch(() => toast.error("Something went wrong!"));
      });
    };
    fetchData();
  }, []);

  const handleCancelClick = () => {
    startTransition(() => {
      setCancelLoading(true);
      cancelAuction(id)
        .then((data) => {
          setCancelLoading(false);
          if (data.error) {
            toast.error(data.error);
            return;
          } else if (data.success) {
            refetchData();
            toast.success("Auction canceled successfully");
          }
        })
        .catch(() => toast.error("Something went wrong!"));
    });
  };

  const onSubmit = (values: z.infer<typeof BidSchema>) => {
    startTransition(() => {
      setBiddingLoading(true);
      bid(values)
        .then((data) => {
          setBiddingLoading(false);
          if (data.error) {
            toast.error(data.error);
          }
          if (data.success) {
            refetchData();
            toast.success("Bid placed successfully!");
          }
        })
        .catch(() => toast.error("Something went wrong!"));
    });
  };

  return (
    <>
      <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-xl">
        Current Price: <span className="text-sky-300">${currentPrice}</span>
      </div>
      <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-md">
        Start time:{" "}
        <span className="text-sky-300">
          {startTime?.toLocaleDateString()} {startTime?.getHours()}:
          {startTime?.getMinutes()}
        </span>
      </div>
      <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-md">
        End time:{" "}
        <span className="text-sky-300">
          {endTime?.toLocaleDateString()} {endTime?.getHours()}:
          {endTime?.getMinutes()}
        </span>
      </div>
      <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-md">
        Status: <span className="text-emerald-300">{status}</span>
      </div>
      <div className="rounded-lg border w-full h-11 flex justify-center gap-1 items-center shadow-md shadow-sky-200 text-md">
        {lastBidderLoading && <BeatLoader color="#36d7b7" />}
        {!lastBidderLoading && lastBid ? (
          <>
            Last bid: <span className="text-sky-300">${lastBid.amount}</span> by{" "}
            <span className="text-sky-300">
              {lastBid.user.id === user?.id ? "you" : lastBid.user.email}
            </span>
          </>
        ) : (
          !lastBidderLoading && <p className="text-sky-300/80">No bids yet</p>
        )}
      </div>
      {role !== UserRole.ADMIN && (
        <Form
          form={form}
          user={user}
          lastBid={lastBid ?? undefined}
          isLoadingBid={biddingLoading}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
      {role === UserRole.ADMIN && (
        <>
          <hr className="w-full border-t border-sky-200" />
          <p className="text-xl font-semibold">Admin Actions</p>
          <div className=" w-full text-center">
            {!cancelLoading ? (
              <Button
                variant="destructive"
                className="text-white hover:text-black w-full"
                size="xl"
                disabled={cancelLoading}
                onClick={handleCancelClick}
              >
                Cancel Auction
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

export default AuctionItemCard;
