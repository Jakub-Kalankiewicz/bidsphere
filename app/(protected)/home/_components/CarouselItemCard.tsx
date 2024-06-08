import { Card, CardContent } from "@/components/ui/card";
import { CarouselItem } from "@/components/ui/carousel";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Item } from "../../_types";
import { formatTimeRemaining } from "@/lib/utils";
import { AuctionStatus } from "@prisma/client";

interface CarouselItemCardProps {
  data: Item;
}

const CarouselItemCard = ({
  data: { id, name, description, currentPrice, pathToImage, endTime, status },
}: CarouselItemCardProps) => {
  const router = useRouter();
  const timeToEnd = endTime && formatTimeRemaining(endTime);
  return (
    <CarouselItem
      key={id}
      className="cursor-pointer"
      style={{
        flexBasis: "calc(33.3333% - 10px)",
      }}
    >
      <Card
        onClick={() => router.push(`/list/${id}`)}
        className="cursor-pointer flex flex-col h-[35rem] text-sky-300 hover:bg-sky-100/30 transition-all duration-1000 ease-in-out hover:text-sky-800"
      >
        <div className="w-full flex justify-center p-6">
          <Image
            src={pathToImage}
            alt={name}
            className="rounded-xl object-fit h-[350px]"
            width={350}
            height={150}
          />
        </div>
        <CardContent className="flex flex-col items-center justify-center">
          {status === AuctionStatus.NOT_STARTED && (
            <>
              <h3 className="text-xl mb-2 text-black">{name}</h3>
              <p className="text-lg mb-4">
                {description.length > 55
                  ? description.slice(0, 55) + "..."
                  : description}
              </p>
              <p className="text-2xl font-semibold text-black">
                ${currentPrice}
              </p>
            </>
          )}
          {status === AuctionStatus.CLOSED && (
            <>
              <h3 className="text-xl mb-2 text-black">{name}</h3>
              <p className="text-lg text-red-300 mb-4">Auction is over</p>
              <p className="text-2xl font-semibold text-black">
                ${currentPrice}
              </p>
            </>
          )}
          {status === AuctionStatus.CANCELED && (
            <>
              <h3 className="text-xl mb-2 text-black">{name}</h3>
              <p className="text-lg text-red-300 mb-4">Auction was canceled</p>
              <p className="text-2xl font-semibold text-black">
                ${currentPrice}
              </p>
            </>
          )}
          {status === AuctionStatus.OPEN && (
            <>
              <h3 className="text-xl mb-2 text-black">{name}</h3>
              <p className="text-lg text-emerald-300 mb-4">Auction is live</p>
              <p className="text-xl font-semibold text-black">
                ${currentPrice}
              </p>
              {timeToEnd && (
                <p className="text-md mt-2 ">
                  Ending in: <span>{timeToEnd}</span>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </CarouselItem>
  );
};

export default CarouselItemCard;
