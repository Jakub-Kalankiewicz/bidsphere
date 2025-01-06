"use client";

import { getItemData } from "@/actions/getItemData";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState, useTransition } from "react";
import { ClipLoader } from "react-spinners";
import { toast } from "sonner";
import AuctionItemCard from "./_components/AuctionItemCard";
import InitialItemCard from "./_components/InitialItemCard";
import { AuctionItem } from "../../_types";
import { AuctionStatus } from "@prisma/client";
import { DefaultCanvas } from "@/components/3D_THREE/canvas";
import DefaultCavasBabylon from "@/components/3D_BABYLON/canvas/DefaultCanvas";
import { Button } from "@/components/ui/button";
import { MdOutlineLightMode, MdLightMode } from "react-icons/md";
import { CameraControls } from "@react-three/drei";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";

const ItemPage = () => {
  const params = useParams<{ itemId: string }>();
  const itemId = params.itemId;
  const [auctionItemData, setAuctionItemData] = useState<AuctionItem>();
  const [isPending, startTransition] = useTransition();
  const [lightIntensity, setLightIntensity] = useState(3);
  const cameraControlsRef = useRef<CameraControls>(null);
  const [renderThree, setRenderThree] = useState(true);
  const [camera, setCamera] = useState<{
    camera: ArcRotateCamera;
    cameraPosition: Vector3;
    cameraTarget: Vector3;
  }>();

  const handleIntensityChange = (increment: boolean) => {
    setLightIntensity((prev) =>
      increment ? Math.min(prev + 1, 15) : Math.max(prev - 1, 1)
    );
  };

  const fetchData = () => {
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
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResetCamera = () => {
    if (renderThree) {
      if (cameraControlsRef.current) {
        cameraControlsRef.current.reset(true);
      }
    } else if (camera) {
      camera.camera.setTarget(camera.cameraTarget);
      camera.camera.setPosition(camera.cameraPosition);
    }
  };

  return (
    <div className="h-full w-full flex md:flex-row flex-col">
      <div className="basis-3/5 flex justify-center items-center flex-col">
        <div className="h-[70%] w-[80%] z-0">
          {auctionItemData?.pathToCanvas ? (
            <>
              <div className="flex justify-center items-center gap-2">
                <Button onClick={() => handleIntensityChange(true)}>
                  <MdLightMode className="w-5 h-5" />
                </Button>
                <Button onClick={() => handleIntensityChange(false)}>
                  <MdOutlineLightMode className="w-5 h-5" />
                </Button>
                <Button onClick={handleResetCamera}>Reset</Button>
                <Button onClick={() => setRenderThree((prev) => !prev)}>
                  Change Renderer
                </Button>
              </div>
              {renderThree ? (
                <DefaultCanvas
                  pathToCanvas={auctionItemData.pathToCanvas}
                  lightIntensity={lightIntensity}
                  cameraControlsRef={cameraControlsRef}
                />
              ) : (
                <DefaultCavasBabylon
                  pathToCanvas={auctionItemData.pathToCanvas}
                  lightIntensity={lightIntensity}
                  setCamera={setCamera}
                />
              )}
            </>
          ) : null}
        </div>
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
                  isPending && (
                    <div className="flex justify-center items-center h-full w-full">
                      <p className="text-2xl font-semibold text-sky-300 text-center">
                        Something went wrong. Try refreshing the page!
                      </p>
                    </div>
                  )
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
