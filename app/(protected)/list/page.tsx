"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipLoader } from "react-spinners";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getListOfItems } from "@/actions/getListOfItems";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Item } from "../_types";
import ItemCard from "./_components/ItemCard";

interface Data {
  notStarted: Item[];
  open: Item[];
  other: Item[];
}

const ListPage = () => {
  const [data, setData] = useState<Data>();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const fetchData = () => {
      startTransition(() => {
        getListOfItems()
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

  return (
    <div className="mt-[150px] w-full">
      <Tabs
        defaultValue="not-started"
        className="flex flex-col gap-y-10 justify-center items-center w-full h-full"
      >
        <TabsList>
          <TabsTrigger value="not-started" className="text-xl">
            New
          </TabsTrigger>
          <TabsTrigger value="open" className="text-xl">
            Ongoing
          </TabsTrigger>
          <TabsTrigger value="other" className="text-xl">
            Other
          </TabsTrigger>
        </TabsList>
        <ScrollArea className="h-[72vh]">
          {isPending || !data ? (
            <div className="mt-[10rem]">
              <ClipLoader color="#36d7b7" size={100} />
            </div>
          ) : (
            <>
              <TabsContent
                value="not-started"
                className="flex flex-wrap max-w-[1200px] items-center gap-10"
              >
                {data.notStarted.length ? (
                  data.notStarted.map((item) => (
                    <ItemCard key={item.id} {...item} status="NOT_STARTED" />
                  ))
                ) : (
                  <div className="text-xl text-white">No available items</div>
                )}
              </TabsContent>
              <TabsContent
                value="open"
                className="flex flex-wrap max-w-[1200px] items-center gap-10"
              >
                {data.open.length ? (
                  data.open.map((item) => (
                    <ItemCard key={item.id} {...item} status="OPEN" />
                  ))
                ) : (
                  <div className="text-xl text-white">No available items</div>
                )}
              </TabsContent>
              <TabsContent
                value="other"
                className="flex flex-wrap max-w-[1200px] items-center gap-10"
              >
                {data.other.length ? (
                  data.other.map((item) => (
                    <ItemCard key={item.id} {...item} status="OTHER" />
                  ))
                ) : (
                  <div className="text-xl text-white">No available items</div>
                )}
              </TabsContent>
            </>
          )}
        </ScrollArea>
      </Tabs>
    </div>
  );
};

export default ListPage;
