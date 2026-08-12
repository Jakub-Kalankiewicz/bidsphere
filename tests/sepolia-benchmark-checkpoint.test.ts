import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { writeBenchmarkCheckpoint } from "../contracts/scripts/sepolia-benchmark-checkpoint.ts";
import type { SepoliaBenchmarkResult } from "../contracts/scripts/sepolia-benchmark-helpers.ts";

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
