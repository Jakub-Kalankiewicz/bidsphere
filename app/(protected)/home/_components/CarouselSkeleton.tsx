import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import React from "react";

const CarouselSkeleton = () => {
  const router = useRouter();
  return (
    <div className="w-full flex flex-col justify-center items-center gap-10">
      <h2 className="text-center font-semibold text-5xl tracking-wider text-white mt-24">
        Check out our newest{" "}
        <span
          className=" text-white underline italic cursor-pointer"
          onClick={() => router.push("/list")}
        >
          Items
        </span>
      </h2>
      <Carousel
        className="max-w-[1200px] w-full"
        opts={{
          loop: true,
        }}
      >
        <CarouselContent>
          {Array.from({ length: 3 }).map((_, index) => (
            <CarouselItem
              key={index}
              style={{
                flexBasis: "calc(33.3333% - 10px)",
              }}
            >
              <Card className="cursor-pointer flex flex-col h-[35rem]">
                <div className="w-full flex justify-center p-6">
                  <Skeleton className="h-[20rem] w-[20rem] rounded-xl object-cover" />
                </div>
                <CardContent className="flex flex-col items-center justify-center">
                  <Skeleton className="h-6 w-36 mb-2" />
                  <Skeleton className="h-4 w-48 mb-4" />
                  <Skeleton className="h-8 w-36" />
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
};

export default CarouselSkeleton;
