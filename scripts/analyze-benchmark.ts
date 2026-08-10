import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  parseBenchmarkCsv,
  groupBenchmarkSamples,
  summarizeMetric,
  type BenchmarkSample,
} from "../lib/benchmark.ts";

const METRICS: readonly (Parameters<typeof summarizeMetric>[1])[] = [
  "urlSignMs",
  "serverCdnMs",
  "clientFetchMs",
  "proofFetchMs",
  "sha256Ms",
  "offlineSha256Ms",
  "rpcMs",
  "merkleVerifyMs",
  "onlineTotalMs",
  "offlineTotalMs",
];

function buildSeriesSummary(samples: BenchmarkSample[]) {
  return {
    seriesId: samples[0]?.seriesId,
    configuration: samples[0]
      ? {
          commit: samples[0].commit,
          environmentId: samples[0].environmentId,
          networkProfile: samples[0].networkProfile,
          fileId: samples[0].fileId,
          fileName: samples[0].fileName,
          rpcProvider: samples[0].rpcProvider,
        }
      : null,
    warmups: samples.filter((sample) => sample.warmup).length,
    recordedSuccessful: samples.filter(
      (sample) => !sample.warmup && sample.status === "success"
    ).length,
    recordedFailed: samples.filter(
      (sample) => !sample.warmup && sample.status === "error"
    ).length,
    quantileMethod: "Hyndman-Fan type 7 (linear interpolation)",
    metrics: Object.fromEntries(
      METRICS.map((metric) => [metric, summarizeMetric(samples, metric)])
    ),
  };
}

function buildSummary(samples: BenchmarkSample[], inputPath: string) {
  return {
    source: inputPath,
    generatedAt: new Date().toISOString(),
    quantileMethod: "Hyndman-Fan type 7 (linear interpolation)",
    series: groupBenchmarkSamples(samples).map(({ samples: group }) =>
      buildSeriesSummary(group)
    ),
  };
}

async function main() {
  const inputArgument = process.argv[2];
  const outputArgument = process.argv[3];
  if (!inputArgument) {
    throw new Error("Usage: npm run analyze:benchmark -- <raw.csv> [summary.json]");
  }

  const inputPath = resolve(inputArgument);
  const samples = parseBenchmarkCsv(await readFile(inputPath, "utf8"));
  const summary = `${JSON.stringify(buildSummary(samples, inputPath), null, 2)}\n`;

  if (outputArgument) {
    const outputPath = resolve(outputArgument);
    await writeFile(outputPath, summary, "utf8");
    console.log(`Saved benchmark summary to ${outputPath}`);
  } else {
    process.stdout.write(summary);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
