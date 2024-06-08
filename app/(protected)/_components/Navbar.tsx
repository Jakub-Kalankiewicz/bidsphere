"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { UserButton } from "@/components/auth/UserButton";

export const Navbar = () => {
  const pathname = usePathname();

  return (
    <nav className="bg-secondary flex justify-between items-center p-4 rounded-xl shadow-sm fixed top-10 w-3/4">
      <div className="flex gap-x-3 items-center">
        <h2 className="mr-8 hover:animate-bounce font-semibold text-2xl">
          B<span className=" text-sky-300">I</span>
          DSPHERE
        </h2>
        <Button asChild variant={pathname === "/home" ? "default" : "outline"}>
          <Link href="/home">Home</Link>
        </Button>
        <Button asChild variant={pathname === "/list" ? "default" : "outline"}>
          <Link href="/list">Exhibits</Link>
        </Button>
        <Button
          asChild
          variant={pathname === "/history" ? "default" : "outline"}
        >
          <Link href="/history">History</Link>
        </Button>
      </div>
      <UserButton />
    </nav>
  );
};
