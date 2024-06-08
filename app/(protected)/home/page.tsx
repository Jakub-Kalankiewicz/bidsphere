"use client";

import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CarouselItemCard from "./_components/CarouselItemCard";
import { toast } from "sonner";
import CarouselSkeleton from "./_components/CarouselSkeleton";
import { getNewestItems } from "@/actions/getNewestItems";
import { Item } from "../_types";

const HomePage = () => {
  const plugin = useRef(Autoplay({ delay: 6000, stopOnMouseEnter: true }));
  const router = useRouter();
  const [data, setData] = useState<Item[]>();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const fetchData = () => {
      startTransition(() => {
        getNewestItems()
          .then((data) => {
            if (data.error) {
              toast.error(data.error);
              return;
            } else if (data.success) {
              setData(data.success);
            }
          })
          .catch(() => {
            toast.error("Failed to fetch data");
          });
      });
    };
    fetchData();
  }, []);

  if (!data || isPending) {
    return <CarouselSkeleton />;
  }

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
        plugins={[plugin.current]}
        className="max-w-[1200px] w-full"
        opts={{
          loop: true,
        }}
        onMouseLeave={() => plugin.current.play()}
      >
        <CarouselContent>
          {data && data.length > 0 ? (
            data.map((item) => <CarouselItemCard key={item.id} data={item} />)
          ) : (
            <div className="text-white text-2xl font-semibold ml-28">
              No items found
            </div>
          )}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
};

export default HomePage;
