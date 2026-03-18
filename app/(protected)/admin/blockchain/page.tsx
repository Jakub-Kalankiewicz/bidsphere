"use client";

import { useEffect, useState, useTransition } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BeatLoader } from "react-spinners";
import { ClipLoader } from "react-spinners";
import { toast } from "sonner";
import {
  getBlockchainRegistry,
  type RegistryEntry,
} from "@/actions/getBlockchainRegistry";
import { simulateTamper, restoreTamper } from "@/actions/simulateTamper";

function truncateHash(hash: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

const BlockchainPage = () => {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadRegistry = () => {
    setLoading(true);
    getBlockchainRegistry().then((result) => {
      setLoading(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setEntries(result);
    });
  };

  useEffect(() => {
    loadRegistry();
  }, []);

  const handleTamper = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await simulateTamper(id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Tamper simulated — view item page to see mismatch");
        loadRegistry();
      }
      setPendingId(null);
    });
  };

  const handleRestore = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await restoreTamper(id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Original model restored");
        loadRegistry();
      }
      setPendingId(null);
    });
  };

  return (
    <RoleGate allowedRole={UserRole.ADMIN}>
      <Card className="w-[900px] mt-[100px] mb-8 max-h-[calc(100vh-160px)] flex flex-col">
        <CardHeader className="shrink-0">
          <p className="text-2xl font-semibold text-center">
            Blockchain Registry
          </p>
          <p className="text-sm text-muted-foreground text-center">
            On-chain integrity records for all 3D models
          </p>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <ClipLoader color="#36d7b7" size={50} />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              No items found.
            </p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border p-4 flex flex-col gap-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{entry.name}</p>
                      {entry.registeredAt && (
                        <p className="text-xs text-muted-foreground">
                          Registered:{" "}
                          {entry.registeredAt.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.isTampered ? (
                        <span className="text-xs font-semibold text-red-500 px-2 py-0.5 rounded-full border border-red-200">
                          ⚠ Tampered
                        </span>
                      ) : entry.onChainHash ? (
                        <span className="text-xs font-semibold text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-200">
                          ✓ Registered
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border">
                          Not registered
                        </span>
                      )}
                    </div>
                  </div>

                  {entry.onChainHash && (
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">
                          On-chain hash:{" "}
                        </span>
                        <span className="font-mono">
                          {truncateHash(entry.onChainHash)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Tx hash:{" "}
                        </span>
                        <span className="font-mono">
                          {truncateHash(entry.blockchainTxHash)}
                        </span>
                      </div>
                    </div>
                  )}

                  {entry.onChainHash && (
                    <div className="flex gap-2 pt-1">
                      {!entry.isTampered ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleTamper(entry.id)}
                        >
                          {isPending && pendingId === entry.id ? (
                            <BeatLoader color="white" size={6} />
                          ) : (
                            "Simulate Tamper"
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleRestore(entry.id)}
                        >
                          {isPending && pendingId === entry.id ? (
                            <BeatLoader size={6} />
                          ) : (
                            "Restore Original"
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </RoleGate>
  );
};

export default BlockchainPage;
