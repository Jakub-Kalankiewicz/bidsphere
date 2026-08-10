"use client";

import { getItemData } from "@/actions/getItemData";
import { generateMerkleProof } from "@/actions/generateMerkleProof";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition, useState } from "react";
import { ClipLoader } from "react-spinners";
import { toast } from "sonner";
import AuctionItemCard from "./_components/AuctionItemCard";
import InitialItemCard from "./_components/InitialItemCard";
import ModelViewer from "./_components/ModelViewer";
import { AuctionItem } from "../../_types";
import { AuctionStatus } from "@prisma/client";

const ItemPage = () => {
  const params = useParams<{ itemId: string }>();
  const itemId = params.itemId;
  const [auctionItemData, setAuctionItemData] = useState<AuctionItem>();
  const [isPending, startTransition] = useTransition();
  const [isDownloadingProof, startProofTransition] = useTransition();
  const initialFetchDone = useRef(false);

  const handleDownloadProof = () => {
    if (!auctionItemData) return;
    startProofTransition(async () => {
      const result = await generateMerkleProof(itemId);
      if ("error" in result) { toast.error(result.error); return; }
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proof-${auctionItemData.name.replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const fetchData = useCallback(() => {
    startTransition(() => {
      getItemData({ id: itemId }).then((data) => {
        if (data.error) {
          toast.error(data.error);
          return;
        } else if (data.success) {
          setAuctionItemData(data.success);
        }
      });
    });
  }, [itemId]);

  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetchData();
  }, [fetchData]);

  return (
    <div className="h-full w-full flex md:flex-row flex-col">
      <div className="basis-3/5 flex justify-center items-center flex-col">
        <div className="h-[70%] w-[80%] z-0">
          {auctionItemData?.pathToCanvas ? (
            <ModelViewer pathToCanvas={auctionItemData.pathToCanvas} itemId={itemId} />
          ) : null}
        </div>
        {auctionItemData?.merkleBatchId && (
          <button
            onClick={handleDownloadProof}
            disabled={isDownloadingProof}
            className="text-xs text-sky-500 underline hover:text-sky-700 mt-2"
          >
            {isDownloadingProof ? "Generating proof..." : "Download offline proof bundle"}
          </button>
        )}
      </div>
      <div className="basis-2/5 flex justify-center items-center flex-col h-full">
        <Card className="2xl:h-3/5 2xl:w-1/2 h-4/5 w-9/12 shadow-2xl mt-24 2xl:mt-0 shadow-sky-300">
          <CardContent className="flex flex-col justify-center items-center gap-y-5 mt-4 h-full">
            {!isPending ? (
              <>
                {auctionItemData ? (
                  <CardHeader className="w-full flex flex-col justify-center items-center gap-5 p-5">
                    <h2 className="text-center font-semibold italic text-4xl tracking-wider text-black mt-5 mb-2">
                      {auctionItemData.name}
                    </h2>
                    <p className="text-xl text-sky-300 mb-4 text-center">
                      {auctionItemData.description}
                    </p>
                  </CardHeader>
                ) : null}
                {auctionItemData ? (
                  auctionItemData.status === AuctionStatus.OPEN ? (
                    <AuctionItemCard
                      refetchData={fetchData}
                      auctionItem={auctionItemData}
                    />
                  ) : (
                    <InitialItemCard
                      id={auctionItemData.id}
                      price={auctionItemData.currentPrice}
                      endTime={auctionItemData.endTime ?? new Date()}
                      status={auctionItemData.status}
                      refetchData={fetchData}
                    />
                  )
                ) : (
                  <div className="flex justify-center items-center h-full w-full">
                    <p className="text-2xl font-semibold text-sky-300 text-center">
                      Something went wrong. Try refreshing the page!
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full mt-[-100px]">
                <ClipLoader color="#36d7b7" size={100} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ItemPage;
