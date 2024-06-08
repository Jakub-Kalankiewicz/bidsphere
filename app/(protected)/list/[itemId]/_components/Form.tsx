import { Input } from "@/components/ui/input";
import {
  Form as FormWrapper,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { BeatLoader } from "react-spinners";
import { UseFormReturn } from "react-hook-form";
import { User } from "next-auth";
import { $Enums } from "@prisma/client";
import { LastBidderType } from "@/app/(protected)/_types";

interface FormProps {
  onSubmit: (data: any) => void;
  form: UseFormReturn<
    {
      amount: number;
      auctionId: string;
    },
    any,
    undefined
  >;
  isPending: boolean;
  isLoadingBid: boolean;
  lastBid?: LastBidderType;
  user:
    | (User & {
        role: $Enums.UserRole;
        name: string;
      })
    | undefined;
}

const Form = ({
  onSubmit,
  form,
  user,
  isLoadingBid,
  lastBid,
  isPending,
}: FormProps) => {
  return (
    <FormWrapper {...form}>
      <form
        className="space-y-6 w-full mt-3 p-1"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className=" text-xl">Bid amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    className="rounded-lg shadow-md shadow-sky-200 text-md"
                    {...field}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {isLoadingBid ? (
          <div className="w-full flex justify-center items-center">
            <BeatLoader color="#36d7b7" className="mt-3" size={20} />
          </div>
        ) : lastBid?.user.id !== user?.id ? (
          <Button
            type="submit"
            variant="primary"
            className="text-white hover:text-black w-full"
            size="xl"
            disabled={isLoadingBid}
          >
            Bid
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            className="text-white hover:text-black w-full"
            size="xl"
            disabled={true}
          >
            You are the highest bidder
          </Button>
        )}
      </form>
    </FormWrapper>
  );
};

export default Form;
