"use client";

import { useEffect, useState, useTransition } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BeatLoader, ClipLoader } from "react-spinners";
import { toast } from "sonner";
import { getBlockchainRegistry, type RegistryEntry } from "@/actions/getBlockchainRegistry";
import { simulateTamper, restoreTamper } from "@/actions/simulateTamper";
import { reregisterModel } from "@/actions/reregisterModel";
import { batchRegister, getPendingBatchItems } from "@/actions/admin/batchRegister";
import { generateMerkleProof } from "@/actions/generateMerkleProof";

function truncateHash(hash: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

const BlockchainPage = () => {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<{ id: string; name: string }[]>([]);
  const [batchPending, setBatchPending] = useState(false);

  const loadRegistry = () => {
    setLoading(true);
    Promise.all([getBlockchainRegistry(), getPendingBatchItems()]).then(
      ([registry, pending]) => {
        setLoading(false);
        if ("error" in registry) { toast.error(registry.error); return; }
        setEntries(registry);
        setPendingItems(pending);
      }
    );
  };

  useEffect(() => {
    Promise.all([getBlockchainRegistry(), getPendingBatchItems()]).then(
      ([registry, pending]) => {
        setLoading(false);
        if ("error" in registry) {
          toast.error(registry.error);
          return;
        }
        setEntries(registry);
        setPendingItems(pending);
      }
    );
  }, []);

  const handleTamper = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await simulateTamper(id);
      if ("error" in result) toast.error(result.error);
      else { toast.success("Tamper simulated — view item page to see mismatch"); loadRegistry(); }
      setPendingId(null);
    });
  };

  const handleReregister = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await reregisterModel(id);
      if ("error" in result) toast.error(result.error);
      else { toast.success("Re-registered on blockchain"); loadRegistry(); }
      setPendingId(null);
    });
  };

  const handleRestore = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await restoreTamper(id);
      if ("error" in result) toast.error(result.error);
      else { toast.success("Original model restored"); loadRegistry(); }
      setPendingId(null);
    });
  };

  const handleBatchRegister = () => {
    if (pendingItems.length === 0) return;
    setBatchPending(true);
    startTransition(async () => {
      const result = await batchRegister(pendingItems.map((i) => i.id));
      setBatchPending(false);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success(`Batch #${result.batchId} registered — ${result.modelCount} models`);
      loadRegistry();
    });
  };

  const handleDownloadProof = (id: string, name: string) => {
    startTransition(async () => {
      const result = await generateMerkleProof(id);
      if ("error" in result) { toast.error(result.error); return; }
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proof-${name.replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <RoleGate allowedRole={UserRole.ADMIN}>
      <Card className="w-[900px] mt-[100px] mb-8 max-h-[calc(100vh-160px)] flex flex-col">
        <CardHeader className="shrink-0">
          <p className="text-2xl font-semibold text-center">Blockchain Registry</p>
          <p className="text-sm text-muted-foreground text-center">
            On-chain integrity records for all 3D models
          </p>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 min-h-0 space-y-6">
          {loading ? (
            <div className="flex justify-center py-10"><ClipLoader color="#36d7b7" size={50} /></div>
          ) : (
            <>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{entry.name}</p>
                        {entry.registeredAt && (
                          <p className="text-xs text-muted-foreground">
                            Registered: {entry.registeredAt.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {entry.isTampered ? (
                          <span className="text-xs font-semibold text-red-500 px-2 py-0.5 rounded-full border border-red-200">⚠ Tampered</span>
                        ) : entry.onChainHash ? (
                          <span className="text-xs font-semibold text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-200">✓ Registered</span>
                        ) : (
                          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border">Not registered</span>
                        )}
                        {entry.merkleBatchId ? (
                          <span className="text-xs font-semibold text-sky-500 px-2 py-0.5 rounded-full border border-sky-200">
                            Merkle batch #{entry.merkleBatchId}
                          </span>
                        ) : entry.onChainHash ? (
                          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border">Individually registered</span>
                        ) : null}
                      </div>
                    </div>

                    {entry.onChainHash && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div><span className="text-muted-foreground">On-chain hash: </span><span className="font-mono">{truncateHash(entry.onChainHash)}</span></div>
                        <div><span className="text-muted-foreground">Tx hash: </span><span className="font-mono">{truncateHash(entry.blockchainTxHash)}</span></div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1 flex-wrap">
                      {!entry.onChainHash && entry.modelHash && (
                        <Button variant="outline" size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleReregister(entry.id)}>
                          {isPending && pendingId === entry.id ? <BeatLoader size={6} /> : "Re-register on blockchain"}
                        </Button>
                      )}
                      {entry.onChainHash && !entry.isTampered && (
                        <Button variant="destructive" size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleTamper(entry.id)}>
                          {isPending && pendingId === entry.id ? <BeatLoader color="white" size={6} /> : "Simulate Tamper"}
                        </Button>
                      )}
                      {entry.onChainHash && entry.isTampered && (
                        <Button variant="outline" size="sm"
                          disabled={isPending && pendingId === entry.id}
                          onClick={() => handleRestore(entry.id)}>
                          {isPending && pendingId === entry.id ? <BeatLoader size={6} /> : "Restore Original"}
                        </Button>
                      )}
                      {entry.merkleBatchId && (
                        <Button variant="outline" size="sm"
                          onClick={() => handleDownloadProof(entry.id, entry.name)}>
                          Download proof bundle
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <p className="font-semibold text-sm">Create Merkle Batch</p>
                {pendingItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    All registered models are already in a Merkle batch.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {pendingItems.length} model{pendingItems.length > 1 ? "s" : ""} pending batching:{" "}
                      {pendingItems.map((i) => i.name).join(", ")}
                    </p>
                    <Button size="sm" onClick={handleBatchRegister} disabled={batchPending}>
                      {batchPending ? <BeatLoader size={6} /> : `Batch register ${pendingItems.length} model${pendingItems.length > 1 ? "s" : ""}`}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </RoleGate>
  );
};

export default BlockchainPage;
