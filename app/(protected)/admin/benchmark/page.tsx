"use client";

import { useState, useTransition } from "react";
import { UserRole } from "@prisma/client";
import { BeatLoader } from "react-spinners";
import { toast } from "sonner";

import {
  getBenchmarkItems,
  runServerFetchDiagnostic,
  runServerBenchmark,
  type BenchmarkItem,
} from "@/actions/benchmark";
import { generateMerkleProof } from "@/actions/generateMerkleProof";
import { RoleGate } from "@/components/auth/RoleGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  createRunPlan,
  summarizeMetric,
  toBenchmarkCsv,
  validateVerificationOutcome,
  type BenchmarkSample,
  type RunPlanEntry,
} from "@/lib/benchmark";
import { verifyProofInBrowser } from "@/lib/merkle-browser";

interface NavigatorWithConnection extends Navigator {
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
}

interface Progress {
  current: number;
  total: number;
}

const EMPTY_PROGRESS: Progress = { current: 0, total: 0 };

function optionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeFilePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "benchmark";
}

function formatMilliseconds(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(3)} ms`;
}

function SummaryCard({
  label,
  samples,
  metric,
}: {
  label: string;
  samples: BenchmarkSample[];
  metric: Parameters<typeof summarizeMetric>[1];
}) {
  const summary = summarizeMetric(samples, metric);
  return (
    <div className="rounded-lg border p-3 text-sm">
      <p className="font-semibold">{label}</p>
      <p className="text-muted-foreground">n = {summary.count}</p>
      <p>mediana: {formatMilliseconds(summary.median)}</p>
      <p>Q1–Q3: {formatMilliseconds(summary.q1)} – {formatMilliseconds(summary.q3)}</p>
      <p>p95: {formatMilliseconds(summary.p95)}</p>
    </div>
  );
}

const BenchmarkPage = () => {
  const [items, setItems] = useState<BenchmarkItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [results, setResults] = useState<BenchmarkSample[]>([]);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [isPending, startTransition] = useTransition();

  const [warmups, setWarmups] = useState(3);
  const [repetitions, setRepetitions] = useState(30);
  const [environmentId, setEnvironmentId] = useState("");
  const [networkProfile, setNetworkProfile] = useState("");
  const [networkEmulated, setNetworkEmulated] = useState(false);
  const [connectionType, setConnectionType] = useState("");
  const [downlinkMbps, setDownlinkMbps] = useState("");
  const [rttMs, setRttMs] = useState("");
  const [rpcProvider, setRpcProvider] = useState("");
  const [commit, setCommit] = useState("");
  const [notes, setNotes] = useState("");

  const loadItems = () => {
    startTransition(async () => {
      const data = await getBenchmarkItems();
      setItems(data);
      setSelectedId((current) => current || data[0]?.id || "");
    });
  };

  const createBaseSample = (
    item: BenchmarkItem,
    run: RunPlanEntry,
    seriesId: string
  ): BenchmarkSample => {
    const browserConnection = (navigator as NavigatorWithConnection).connection;
    return {
      timestamp: new Date().toISOString(),
      seriesId,
      commit: commit.trim(),
      environmentId: environmentId.trim(),
      networkProfile: networkProfile.trim(),
      networkEmulated,
      connectionType: connectionType.trim() || browserConnection?.effectiveType || "unknown",
      downlinkMbps: optionalNumber(downlinkMbps) ?? browserConnection?.downlink ?? null,
      rttMs: optionalNumber(rttMs) ?? browserConnection?.rtt ?? null,
      rpcProvider: rpcProvider.trim(),
      rpcStatus: "",
      rpcError: "",
      browser: navigator.userAgent,
      os: navigator.platform,
      fileId: item.id,
      fileName: item.name,
      fileSizeBytes: null,
      iteration: run.iteration,
      warmup: run.warmup,
      status: "error",
      error: "",
      urlSignMs: null,
      serverCdnMs: null,
      clientFetchMs: null,
      proofFetchMs: null,
      sha256Ms: null,
      offlineSha256Ms: null,
      rpcMs: null,
      merkleVerifyMs: null,
      onlineTotalMs: null,
      offlineTotalMs: null,
      proofSizeBytes: null,
      individualVerified: null,
      merkleVerified: null,
      notes: notes.trim(),
    };
  };

  const runSingleSample = async (
    item: BenchmarkItem,
    run: RunPlanEntry,
    seriesId: string
  ): Promise<BenchmarkSample> => {
    const sample = createBaseSample(item, run, seriesId);

    try {
      const serverResult = await runServerBenchmark(item.id);
      if ("error" in serverResult) throw new Error(serverResult.error);

      sample.rpcMs = serverResult.blockchainQueryDurationMs;
      sample.rpcStatus = serverResult.blockchainStatus;
      sample.rpcError = serverResult.blockchainError;
      if (serverResult.blockchainStatus === "unavailable") {
        throw new Error(`RPC query failed: ${serverResult.blockchainError}`);
      }

      const fetchStart = performance.now();
      const response = await fetch(serverResult.proxyPath, { cache: "no-store" });
      if (!response.ok) throw new Error(`Model fetch failed with HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      sample.clientFetchMs = performance.now() - fetchStart;
      sample.fileSizeBytes = buffer.byteLength;

      const hashStart = performance.now();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      sample.sha256Ms = performance.now() - hashStart;
      const clientHash =
        "0x" +
        [...new Uint8Array(hashBuffer)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");

      if (serverResult.onChainData) {
        sample.individualVerified =
          clientHash.toLowerCase() === serverResult.onChainData.hash.toLowerCase();
      }
      sample.onlineTotalMs =
        sample.clientFetchMs + sample.sha256Ms + sample.rpcMs;

      let proofBundle: Awaited<ReturnType<typeof generateMerkleProof>> | null = null;
      if (item.merkleBatchId) {
        const proofStart = performance.now();
        proofBundle = await generateMerkleProof(item.id);
        sample.proofFetchMs = performance.now() - proofStart;
        if ("error" in proofBundle) throw new Error(proofBundle.error);
        sample.proofSizeBytes = new Blob([JSON.stringify(proofBundle)]).size;
      }

      if (proofBundle && !("error" in proofBundle)) {
        const offlineStart = performance.now();
        const offlineHashStart = performance.now();
        const offlineHashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        sample.offlineSha256Ms = performance.now() - offlineHashStart;
        const offlineHash =
          "0x" +
          [...new Uint8Array(offlineHashBuffer)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        const merkleStart = performance.now();
        sample.merkleVerified = await verifyProofInBrowser(
          offlineHash,
          proofBundle.merkleProof,
          proofBundle.merkleRoot
        );
        sample.merkleVerifyMs = performance.now() - merkleStart;
        sample.offlineTotalMs = performance.now() - offlineStart;
      }

      validateVerificationOutcome({
        rpcStatus: sample.rpcStatus,
        individualVerified: sample.individualVerified,
        merkleExpected: item.merkleBatchId !== null,
        merkleVerified: sample.merkleVerified,
      });

      sample.status = "success";
      return sample;
    } catch (error) {
      sample.error = error instanceof Error ? error.message : "Unknown benchmark error";
      return sample;
    }
  };

  const runSeries = () => {
    const item = items.find((candidate) => candidate.id === selectedId);
    if (!item) {
      toast.error("Select a model first");
      return;
    }
    if (!environmentId.trim() || !networkProfile.trim() || !rpcProvider.trim() || !commit.trim()) {
      toast.error("Environment, network profile, RPC provider and commit are required");
      return;
    }

    let plan: RunPlanEntry[];
    try {
      plan = createRunPlan(warmups, repetitions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid run counts");
      return;
    }

    startTransition(async () => {
      const seriesId = crypto.randomUUID();
      const seriesSamples: BenchmarkSample[] = [];
      setResults([]);
      setProgress({ current: 0, total: plan.length * 2 });
      for (const [index, run] of plan.entries()) {
        const sample = await runSingleSample(item, run, seriesId);
        seriesSamples.push(sample);
        setResults([...seriesSamples]);
        setProgress({ current: index + 1, total: plan.length * 2 });
      }
      for (const [index, sample] of seriesSamples.entries()) {
        const diagnostic = await runServerFetchDiagnostic(item.id);
        if ("error" in diagnostic) {
          const diagnosticNote = `server-CDN diagnostic failed: ${diagnostic.error}`;
          sample.notes = sample.notes
            ? `${sample.notes}; ${diagnosticNote}`
            : diagnosticNote;
        } else {
          sample.urlSignMs = diagnostic.signDurationMs;
          sample.serverCdnMs = diagnostic.serverFetchDurationMs;
        }
        setResults([...seriesSamples]);
        setProgress({ current: plan.length + index + 1, total: plan.length * 2 });
      }
      toast.success(`Series finished: ${warmups} warmups and ${repetitions} recorded runs`);
    });
  };

  const exportCsv = () => {
    const blob = new Blob([toBenchmarkCsv(results)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilePart(environmentId)}_${safeFilePart(networkProfile)}_${new Date().toISOString().replaceAll(":", "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const successfulRecorded = results.filter((sample) => !sample.warmup && sample.status === "success");
  const failedRecorded = results.filter((sample) => !sample.warmup && sample.status === "error");

  return (
    <RoleGate allowedRole={UserRole.ADMIN}>
      <Card className="w-[1100px] max-w-[95vw] mt-[80px] mb-8">
        <CardHeader>
          <p className="text-2xl font-semibold text-center">Research Benchmark</p>
          <p className="text-sm text-muted-foreground text-center">
            Raw repeated measurements for online and offline integrity verification
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-3 items-center">
            <Button variant="outline" onClick={loadItems} disabled={isPending}>Load models</Button>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={isPending}
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select a model</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.merkleBatchId ? ` — batch #${item.merkleBatchId}` : " — individual only"}
                </option>
              ))}
            </select>
          </div>

          <fieldset
            disabled={isPending}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm disabled:opacity-70"
          >
            <label>Environment ID<input className="mt-1 w-full rounded border p-2" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} /></label>
            <label>Network profile<input className="mt-1 w-full rounded border p-2" value={networkProfile} onChange={(e) => setNetworkProfile(e.target.value)} /></label>
            <label>RPC provider<input className="mt-1 w-full rounded border p-2" value={rpcProvider} onChange={(e) => setRpcProvider(e.target.value)} placeholder="localhost / provider name" /></label>
            <label>Git commit<input className="mt-1 w-full rounded border p-2 font-mono" value={commit} onChange={(e) => setCommit(e.target.value)} /></label>
            <label>Connection type<input className="mt-1 w-full rounded border p-2" value={connectionType} onChange={(e) => setConnectionType(e.target.value)} placeholder="fiber / LTE / effectiveType" /></label>
            <label>Downlink [Mbps]<input type="number" min="0" step="any" className="mt-1 w-full rounded border p-2" value={downlinkMbps} onChange={(e) => setDownlinkMbps(e.target.value)} /></label>
            <label>RTT [ms]<input type="number" min="0" step="any" className="mt-1 w-full rounded border p-2" value={rttMs} onChange={(e) => setRttMs(e.target.value)} /></label>
            <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={networkEmulated} onChange={(e) => setNetworkEmulated(e.target.checked)} /> Network emulated</label>
            <label>Warmups<input type="number" min="0" max="10" className="mt-1 w-full rounded border p-2" value={warmups} onChange={(e) => setWarmups(Number(e.target.value))} /></label>
            <label>Recorded repetitions<input type="number" min="1" max="100" className="mt-1 w-full rounded border p-2" value={repetitions} onChange={(e) => setRepetitions(Number(e.target.value))} /></label>
            <label className="col-span-2">Notes<input className="mt-1 w-full rounded border p-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </fieldset>

          <div className="flex gap-3 items-center">
            <Button onClick={runSeries} disabled={isPending || !selectedId}>
              {isPending ? <BeatLoader color="white" size={8} /> : "Run series"}
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={results.length === 0 || isPending}>Export raw CSV</Button>
            <Button variant="outline" onClick={() => setResults([])} disabled={results.length === 0 || isPending}>Clear</Button>
            {progress.total > 0 && <span className="text-sm text-muted-foreground">Run {progress.current}/{progress.total}</span>}
          </div>

          {results.length > 0 && (
            <>
              <div className="text-sm">
                Recorded successes: <strong>{successfulRecorded.length}</strong>; recorded failures: <strong>{failedRecorded.length}</strong>; warmups: <strong>{results.filter((sample) => sample.warmup).length}</strong>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryCard label="Online total" samples={results} metric="onlineTotalMs" />
                <SummaryCard label="Offline total" samples={results} metric="offlineTotalMs" />
                <SummaryCard label="RPC query" samples={results} metric="rpcMs" />
                <SummaryCard label="Client fetch" samples={results} metric="clientFetchMs" />
                <SummaryCard label="SHA-256" samples={results} metric="sha256Ms" />
                <SummaryCard label="Offline SHA-256" samples={results} metric="offlineSha256Ms" />
                <SummaryCard label="Merkle verification" samples={results} metric="merkleVerifyMs" />
              </div>
              {failedRecorded.length > 0 && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {failedRecorded.slice(-5).map((sample) => (
                    <p key={`${sample.timestamp}-${sample.iteration}`}>Iteration {sample.iteration}: {sample.error}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </RoleGate>
  );
};

export default BenchmarkPage;
