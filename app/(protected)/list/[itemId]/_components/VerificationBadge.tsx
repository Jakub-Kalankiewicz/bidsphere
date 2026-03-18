"use client";

import { useEffect, useState } from "react";
import { getModelHash } from "@/actions/getModelHash";

type VerificationState =
  | "idle"
  | "loading"
  | "verified"
  | "tampered"
  | "not_registered"
  | "unavailable";

interface VerificationBadgeProps {
  itemId: string;
  pathToCanvas: string;
}

async function computeClientHash(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch model (${response.status})`);
  const buffer = await response.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashHex = [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "0x" + hashHex;
}

const VerificationBadge = ({ itemId, pathToCanvas }: VerificationBadgeProps) => {
  const [state, setState] = useState<VerificationState>("idle");
  const [clientHash, setClientHash] = useState("");
  const [onChainHash, setOnChainHash] = useState("");
  const [registeredAt, setRegisteredAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!pathToCanvas || !itemId) return;

    const verify = async () => {
      setState("loading");
      try {
        const [computedHash, chainResult] = await Promise.all([
          computeClientHash(pathToCanvas),
          getModelHash(itemId),
        ]);

        if (chainResult.status === "unavailable") {
          setState("unavailable");
          return;
        }
        if (chainResult.status === "not_registered") {
          setState("not_registered");
          return;
        }

        setClientHash(computedHash);
        setOnChainHash(chainResult.onChainHash);
        setRegisteredAt(new Date(chainResult.timestamp * 1000));

        const match =
          computedHash.toLowerCase() === chainResult.onChainHash.toLowerCase();
        setState(match ? "verified" : "tampered");
      } catch {
        setState("unavailable");
      }
    };

    verify();
  }, [itemId, pathToCanvas]);

  if (state === "idle" || state === "loading") {
    return (
      <p className="text-xs text-gray-400 mt-2 animate-pulse">
        Verifying integrity...
      </p>
    );
  }

  if (state === "verified") {
    return (
      <div className="mt-2 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-emerald-500">
            ✓ Verified
          </span>
          <span className="text-xs text-gray-400 font-mono">
            {onChainHash.slice(0, 10)}...{onChainHash.slice(-6)}
          </span>
        </div>
        {registeredAt && (
          <p className="text-xs text-gray-400">
            Registered {registeredAt.toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  if (state === "tampered") {
    return (
      <div className="mt-2 flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-red-500">
          ⚠ Integrity mismatch
        </span>
        <p className="text-xs text-gray-400 font-mono">
          On-chain: {onChainHash.slice(0, 10)}...
        </p>
        <p className="text-xs text-gray-400 font-mono">
          Received: {clientHash.slice(0, 10)}...
        </p>
      </div>
    );
  }

  if (state === "not_registered") {
    return (
      <p className="text-xs text-gray-400 mt-2">Not registered on blockchain</p>
    );
  }

  return (
    <p className="text-xs text-gray-400 mt-2">Verification unavailable</p>
  );
};

export default VerificationBadge;
