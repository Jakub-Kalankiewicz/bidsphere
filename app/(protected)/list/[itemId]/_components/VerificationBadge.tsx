"use client";

import { useEffect, useRef, useState } from "react";
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

interface HashModalProps {
  verified: boolean;
  onChainHash: string;
  clientHash: string;
  registeredAt: Date | null;
  onClose: () => void;
}

const HashModal = ({ verified, onChainHash, clientHash, registeredAt, onClose }: HashModalProps) => (
  <>
    <div
      className="fixed inset-0 bg-black/30 z-40"
      onClick={onClose}
    />
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl border shadow-2xl p-5 w-[480px] max-w-[92vw]">
      <div className="flex justify-between items-center mb-4">
        <span className={`font-semibold text-sm ${verified ? "text-emerald-600" : "text-red-600"}`}>
          {verified ? "✓ Integrity Verified" : "⚠ Integrity Mismatch"}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>
      <div className="space-y-3 text-xs">
        <div>
          <p className="text-gray-500 mb-1 font-medium">On-chain SHA-256 (blockchain record):</p>
          <p className={`font-mono break-all p-2 rounded ${verified ? "bg-emerald-50 text-emerald-700" : "bg-emerald-50 text-emerald-700"}`}>
            {onChainHash}
          </p>
        </div>
        <div>
          <p className="text-gray-500 mb-1 font-medium">Computed SHA-256 (this file):</p>
          <p className={`font-mono break-all p-2 rounded ${verified ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {clientHash}
          </p>
        </div>
        {verified && registeredAt && (
          <p className="text-gray-400 pt-1">
            Registered on blockchain: {registeredAt.toLocaleString()}
          </p>
        )}
        {!verified && (
          <p className="text-red-500 font-medium pt-1">
            The hashes do not match — this file may have been tampered with.
          </p>
        )}
      </div>
    </div>
  </>
);

const VerificationBadge = ({ itemId, pathToCanvas }: VerificationBadgeProps) => {
  const [state, setState] = useState<VerificationState>("idle");
  const [clientHash, setClientHash] = useState("");
  const [onChainHash, setOnChainHash] = useState("");
  const [registeredAt, setRegisteredAt] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (!pathToCanvas || !itemId || verifyingRef.current) return;
    verifyingRef.current = true;

    const verify = async () => {
      setState("loading");
      try {
        const [computedHash, chainResult] = await Promise.all([
          computeClientHash(pathToCanvas),
          getModelHash(itemId),
        ]);

        if (chainResult.status === "unavailable") { setState("unavailable"); return; }
        if (chainResult.status === "not_registered") { setState("not_registered"); return; }

        setClientHash(computedHash);
        setOnChainHash(chainResult.onChainHash);
        setRegisteredAt(new Date(chainResult.timestamp * 1000));

        setState(
          computedHash.toLowerCase() === chainResult.onChainHash.toLowerCase()
            ? "verified"
            : "tampered"
        );
      } catch {
        setState("unavailable");
      }
    };

    verify();
  }, [itemId, pathToCanvas]);

  if (state === "idle" || state === "loading") {
    return <p className="text-xs text-gray-400 mt-2 animate-pulse">Verifying integrity...</p>;
  }

  if (state === "verified") {
    return (
      <div className="mt-2">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 text-left hover:opacity-70 transition-opacity"
        >
          <span className="text-xs font-semibold text-emerald-500">✓ Verified</span>
          <span className="text-xs text-gray-400 font-mono">
            {onChainHash.slice(0, 10)}...{onChainHash.slice(-6)}
          </span>
          <span className="text-xs text-gray-400">▼</span>
        </button>
        {registeredAt && (
          <p className="text-xs text-gray-400 mt-0.5">Registered {registeredAt.toLocaleDateString()}</p>
        )}
        {modalOpen && (
          <HashModal
            verified
            onChainHash={onChainHash}
            clientHash={clientHash}
            registeredAt={registeredAt}
            onClose={() => setModalOpen(false)}
          />
        )}
      </div>
    );
  }

  if (state === "tampered") {
    return (
      <div className="mt-2">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 text-left hover:opacity-70 transition-opacity"
        >
          <span className="text-xs font-semibold text-red-500">⚠ Integrity mismatch</span>
          <span className="text-xs text-gray-400">▼</span>
        </button>
        {modalOpen && (
          <HashModal
            verified={false}
            onChainHash={onChainHash}
            clientHash={clientHash}
            registeredAt={null}
            onClose={() => setModalOpen(false)}
          />
        )}
      </div>
    );
  }

  if (state === "not_registered") {
    return <p className="text-xs text-gray-400 mt-2">Not registered on blockchain</p>;
  }

  return <p className="text-xs text-gray-400 mt-2">Verification unavailable</p>;
};

export default VerificationBadge;
