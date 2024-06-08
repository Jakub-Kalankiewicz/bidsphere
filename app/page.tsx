import { Poppins } from "next/font/google";

import { cn } from "@/lib/utils";
import { LoginButton } from "@/components/auth/LoginButton";
import { Button } from "@/components/ui/button";

const font = Poppins({
  subsets: ["latin"],
  weight: ["600"],
});

export default function LandingPage() {
  return (
    <main className="flex h-full flex-col items-center justify-center gradient-background relative z-0">
      <div className="absolute inset-0 bg-[url('../public/images/background.png')] bg-cover opacity-40 z-[-1]"></div>
      <div className="space-y-6 text-center relative z-10">
        <h1
          className={cn(
            "text-6xl font-semibold text-white drop-shadow-md",
            font.className
          )}
        >
          Welcome to the{" "}
          <span className=" font-semibold text-7xl tracking-widest text-sky-300 inline-block hover:animate-bounce">
            B<span className="text-sky-200">I</span>DSPHERE
          </span>
        </h1>
        <div>
          <LoginButton asChild>
            <Button variant="primary" size="xl">
              Sign In
            </Button>
          </LoginButton>
        </div>
      </div>
    </main>
  );
}
