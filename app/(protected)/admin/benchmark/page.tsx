"use client";

import { useEffect, useState, useTransition } from "react";
import { RoleGate } from "@/components/auth/RoleGate";
import { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BeatLoader } from "react-spinners";
import { toast } from "sonner";
import {
  getBenchmarkItems,
  runServerBenchmark,
  type BenchmarkItem,
} from "@/actions/benchmark";

interface BenchmarkResult {
  itemName: string;
  fileSizeKb: number;
  signDurationMs: number;
  fetchDurationMs: number;
  hashDurationMs: number;
  blockchainQueryDurationMs: number;
  totalDurationMs: number;
  verified: boolean | null;
}


const BenchmarkPage = () => {
  const [items, setItems] = useState<BenchmarkItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getBenchmarkItems().then((data) => {
      setItems(data);
      if (data.length > 0) setSelectedId(data[0].id);
    });
  }, []);

  const handleRun = () => {
    if (!selectedId) return;
    const item = items.find((i) => i.id === selectedId);
    if (!item) return;

    startTransition(async () => {
      const totalStart = performance.now();

      const serverResult = await runServerBenchmark(selectedId);
      if ("error" in serverResult) {
        toast.error(serverResult.error);
        return;
      }

      const { signedUrl, signDurationMs, onChainData, blockchainQueryDurationMs } =
        serverResult;

      // Measure fetch + hash client-side
      const fetchStart = performance.now();
      let fetchDurationMs = 0;
      let hashDurationMs = 0;
      let fileSizeKb = 0;
      let clientHash = "";
      let verified: boolean | null = null;

      try {
        const response = await fetch(signedUrl);
        const buffer = await response.arrayBuffer();
        fetchDurationMs = Math.round(performance.now() - fetchStart);
        fileSizeKb = Math.round(buffer.byteLength / 1024);

        const hashStart = performance.now();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        hashDurationMs = Math.round(performance.now() - hashStart);
        clientHash =
          "0x" +
          [...new Uint8Array(hashBuffer)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        if (onChainData) {
          verified =
            clientHash.toLowerCase() === onChainData.hash.toLowerCase();
        }
      } catch {
        toast.error("Failed to fetch model for hashing");
        return;
      }

      const totalDurationMs = Math.round(performance.now() - totalStart);

      setResults((prev) => [
        {
          itemName: item.name,
          fileSizeKb,
          signDurationMs,
          fetchDurationMs,
          hashDurationMs,
          blockchainQueryDurationMs,
          totalDurationMs,
          verified,
        },
        ...prev,
      ]);
    });
  };

  return (
    <RoleGate allowedRole={UserRole.ADMIN}>
      <Card className="w-[800px] mt-[100px] mb-8 max-h-[calc(100vh-160px)] flex flex-col">
        <CardHeader className="shrink-0">
          <p className="text-2xl font-semibold text-center">
            Performance Benchmark
          </p>
          <p className="text-sm text-muted-foreground text-center">
            Measures overhead of each security layer step
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 overflow-hidden min-h-0">
          <div className="flex gap-3 items-center">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Button onClick={handleRun} disabled={isPending || !selectedId}>
              {isPending ? (
                <BeatLoader color="white" size={8} />
              ) : (
                "Run Benchmark"
              )}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1">
              {results.map((r, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{r.itemName}</p>
                    <span className="text-xs text-muted-foreground">
                      {r.fileSizeKb} KB
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        URL signing (server)
                      </span>
                      <span className="font-mono">{r.signDurationMs} ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Blockchain query (server)
                      </span>
                      <span className="font-mono">
                        {r.blockchainQueryDurationMs} ms
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Model fetch (network)
                      </span>
                      <span className="font-mono">{r.fetchDurationMs} ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        SHA-256 hash (client)
                      </span>
                      <span className="font-mono">{r.hashDurationMs} ms</span>
                    </div>
                    <div className="flex justify-between col-span-2 border-t pt-2">
                      <span className="font-semibold">Total</span>
                      <span className="font-mono font-semibold">
                        {r.totalDurationMs} ms
                      </span>
                    </div>
                  </div>
                  {r.verified !== null && (
                    <p
                      className={`text-xs font-semibold ${r.verified ? "text-emerald-500" : "text-red-500"}`}
                    >
                      {r.verified ? "✓ Integrity verified" : "⚠ Integrity mismatch"}
                    </p>
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


export default BenchmarkPage;
