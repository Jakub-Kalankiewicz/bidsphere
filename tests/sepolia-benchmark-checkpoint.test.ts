import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { SepoliaBenchmarkResult } from "../contracts/scripts/sepolia-benchmark-helpers.ts";

type CheckpointWriter = (
  outputPath: string,
  result: SepoliaBenchmarkResult,
  forbiddenValues: readonly string[]
) => Promise<void>;

const run = promisify(execFile);
const contractsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../contracts"
);
let compiledDirectory: string | undefined;
let writeBenchmarkCheckpoint: CheckpointWriter;

before(async () => {
  compiledDirectory = await mkdtemp(join(tmpdir(), "bidsphere-checkpoint-build-"));
  await run("npx", ["tsc", "--outDir", compiledDirectory], {
    cwd: contractsDirectory,
  });
  const checkpointModule = (await import(
    pathToFileURL(
      join(compiledDirectory, "scripts", "sepolia-benchmark-checkpoint.js")
    ).href
  )) as { writeBenchmarkCheckpoint: CheckpointWriter };
  writeBenchmarkCheckpoint = checkpointModule.writeBenchmarkCheckpoint;
});

after(async () => {
  if (compiledDirectory) {
    await rm(compiledDirectory, { recursive: true, force: true });
  }
});

function createRunningResult(): SepoliaBenchmarkResult {
  return {
    schemaVersion: 1,
    seriesId: "series-checkpoint",
    startedAtUtc: "2026-08-12T10:00:00.000Z",
    completedAtUtc: null,
    status: "running",
    abortReason: null,
    network: "sepolia",
    chainId: 11155111,
    rpcProviderLabel: "test provider",
    codeVersion: "test-version",
    deployerAddress: "0x1234",
    contractAddresses: { individual: null, merkle: null },
    configuration: {
      batchSize: 10,
      warmupRounds: 1,
      recordedRounds: 5,
      receiptConfirmations: 1,
      receiptTimeoutMs: 600000,
      aggregateGasCeiling: "16500000",
      approvedMaximumWei: "1000000000000000",
    },
    plannedOperations: [],
    transactions: [],
    rounds: [],
    totalGasUsed: "0",
    totalActualFeeWei: "0",
    reservedPendingWei: "0",
    balanceBeforeWei: "1000000000000000",
    balanceAfterWei: null,
    runtime: { node: "v22.0.0", hardhat: "3.0.0" },
  };
}

async function doesNotExist(path: string): Promise<boolean> {
  try {
    await stat(path);
    return false;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

test("atomically replaces a running checkpoint with an aborted checkpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bidsphere-sepolia-"));
  const outputPath = join(directory, "benchmark.json");

  try {
    const running = createRunningResult();
    await writeBenchmarkCheckpoint(outputPath, running, []);

    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), running);
    assert.equal(await doesNotExist(`${outputPath}.tmp`), true);

    const aborted = {
      ...running,
      status: "aborted" as const,
      abortReason: "receipt timeout",
    };
    await writeBenchmarkCheckpoint(outputPath, aborted, []);

    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), aborted);
    assert.equal(await doesNotExist(`${outputPath}.tmp`), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a checkpoint containing forbidden metadata without writing either file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bidsphere-sepolia-"));
  const outputPath = join(directory, "benchmark.json");
  const forbiddenValues = ["https://secret-rpc.invalid/key", "private-key-literal"];
  const result = {
    ...createRunningResult(),
    rpcProviderLabel: "https://secret-rpc.invalid/key",
  };

  try {
    await assert.rejects(
      writeBenchmarkCheckpoint(outputPath, result, forbiddenValues),
      /Secret value found/
    );
    assert.equal(await doesNotExist(outputPath), true);
    assert.equal(await doesNotExist(`${outputPath}.tmp`), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
