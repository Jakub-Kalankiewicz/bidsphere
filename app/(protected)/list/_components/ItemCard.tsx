import { Card, CardContent } from "@/components/ui/card";
import { formatTimeRemaining } from "@/lib/utils";
import { AuctionStatus } from "@prisma/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Tilt } from "react-tilt";

interface ItemCardProps {
  id: string;
  name: string;
  description: string;
  currentPrice: number;
  pathToImage: string;
  endTime: Date | null;
  status: "OPEN" | "NOT_STARTED" | "OTHER";
}

const grayPlaceholder =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='100%25' height='100%25' fill='%23cccccc'/%3E%3C/svg%3E";

const ItemCard = ({
  id,
  name,
  description,
  currentPrice,
  pathToImage,
  endTime,
  status,
}: ItemCardProps) => {
  const router = useRouter();

  const timeToEnd = endTime && formatTimeRemaining(endTime);
  return (
    <Tilt className="p-5 rounded-2xl sm:w-[360px] w-full">
      <Card
        onClick={() => {console.log('test');router.push(`/list/${id}`)}}
        className="cursor-pointer flex flex-col h-[30rem] text-sky-300 hover:bg-sky-100/30 transition-all duration-1000 ease-in-out hover:text-sky-800"
      >
        <div className="w-full flex justify-center p-6">
          <Image
            src={pathToImage}
            alt={name}
            className="rounded-xl object-fit h-[250px]"
            width={300}
            height={150}
            placeholder="blur"
            blurDataURL={grayPlaceholder}
          />
        </div>
        <CardContent className="flex flex-col items-center justify-center">
          {status === "NOT_STARTED" && (
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
          {status === "OTHER" && (
            <>
              <h3 className="text-xl mb-2 text-black">{name}</h3>
              <p className="text-lg text-red-300 mb-4">
                Auction is already over
              </p>
              <p className="text-2xl font-semibold text-black">
                ${currentPrice}
              </p>
            </>
          )}
          {status === "OPEN" && (
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
    </Tilt>
  );
};

export default ItemCard;
