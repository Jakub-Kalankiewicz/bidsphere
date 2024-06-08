import { Poppins } from "next/font/google";

import { cn } from "@/lib/utils";

const font = Poppins({
  subsets: ["latin"],
  weight: ["600"],
});

interface HeaderProps {
  label: string;
}

export const Header = ({ label }: HeaderProps) => {
  return (
    <div className="w-full flex flex-col gap-y-4 items-center justify-center">
      <h1 className={cn("text-3xl font-semibold", font.className)}>
        <span className=" font-semibold text-4xl tracking-widest text-sky-200 inline-block hover:animate-bounce">
          B<span className="">I</span>DSPHERE
        </span>
      </h1>
      <p className="text-muted-foreground text-md">{label}</p>
    </div>
  );
};
