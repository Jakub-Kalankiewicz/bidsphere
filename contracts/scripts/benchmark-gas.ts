import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";

export const DEFAULT_BATCH_SIZES = [1, 2, 5, 10, 25, 50, 100] as const;

export interface GasBenchmarkRow {
  timestamp: string;
  commit: string;
  network: string;
  batchSize: number;
  repetition: number;
  individualTotalGas: bigint;
  merkleBatchGas: bigint;
  individualGasPerModel: number;
  merkleGasPerModel: number;
  modelIdLength: number;
}

function validateConfiguration(batchSizes: readonly number[], repetitions: number) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new RangeError("repetitions must be an integer between 1 and 100");
  }
  if (
    batchSizes.length === 0 ||
    batchSizes.some((size) => !Number.isInteger(size) || size < 1 || size > 100)
  ) {
    throw new RangeError("batch sizes must be integers between 1 and 100");
  }
}

async function deployFreshRegistry() {
  const factory = await ethers.getContractFactory("ModelRegistry");
  const registry = await factory.deploy();
  await registry.waitForDeployment();
  return registry;
}

export function createModelIds(batchSize: number): string[] {
  return Array.from(
    { length: batchSize },
    (_, index) => (index + 1).toString(16).padStart(24, "0")
  );
}

async function measureIndividualRegistration(ids: readonly string[], root: string): Promise<bigint> {
  const registry = await deployFreshRegistry();
  let totalGas = 0n;
  for (const id of ids) {
    const receipt = await (await registry.registerModel(id, root)).wait();
    if (!receipt) throw new Error("Missing receipt for individual registration");
    totalGas += receipt.gasUsed;
  }
  return totalGas;
}

async function measureMerkleRegistration(ids: readonly string[], root: string): Promise<bigint> {
  const registry = await deployFreshRegistry();
  const receipt = await (await registry.registerMerkleRoot(root, ids)).wait();
  if (!receipt) throw new Error("Missing receipt for Merkle registration");
  return receipt.gasUsed;
}

export async function measureGasComparison(
  batchSizes: readonly number[] = DEFAULT_BATCH_SIZES,
  repetitions = 30,
  commit = ""
): Promise<GasBenchmarkRow[]> {
  validateConfiguration(batchSizes, repetitions);
  if (!commit.trim()) throw new Error("A non-empty git commit is required");
  const rows: GasBenchmarkRow[] = [];

  for (const batchSize of batchSizes) {
    const ids = createModelIds(batchSize);
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const root = ethers.sha256(
        ethers.toUtf8Bytes(`bidsphere-gas-${batchSize}-${repetition}`)
      );
      const individualTotalGas = await measureIndividualRegistration(ids, root);
      const merkleBatchGas = await measureMerkleRegistration(ids, root);
      rows.push({
        timestamp: new Date().toISOString(),
        commit,
        network: network.name,
        batchSize,
        repetition,
        individualTotalGas,
        merkleBatchGas,
        individualGasPerModel: Number(individualTotalGas) / batchSize,
        merkleGasPerModel: Number(merkleBatchGas) / batchSize,
        modelIdLength: ids[0].length,
      });
    }
  }

  return rows;
}

function csvValue(value: string | number | bigint): string {
  const raw = String(value);
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function gasRowsToCsv(rows: readonly GasBenchmarkRow[]): string {
  const header = [
    "timestamp",
    "commit",
    "network",
    "batch_size",
    "repetition",
    "individual_total_gas",
    "merkle_batch_gas",
    "individual_gas_per_model",
    "merkle_gas_per_model",
    "model_id_length",
  ];
  const body = rows.map((row) =>
    [
      row.timestamp,
      row.commit,
      row.network,
      row.batchSize,
      row.repetition,
      row.individualTotalGas,
      row.merkleBatchGas,
      row.individualGasPerModel,
      row.merkleGasPerModel,
      row.modelIdLength,
    ].map(csvValue).join(",")
  );
  return [header.join(","), ...body].join("\n");
}

async function main() {
  const repetitions = Number(process.env.GAS_BENCHMARK_REPETITIONS ?? "30");
  const commit = process.env.GAS_BENCHMARK_COMMIT?.trim();
  if (!commit) {
    throw new Error("GAS_BENCHMARK_COMMIT is required for reproducible measurements");
  }
  const rows = await measureGasComparison(DEFAULT_BATCH_SIZES, repetitions, commit);
  const csv = gasRowsToCsv(rows);
  const output = process.env.GAS_BENCHMARK_OUTPUT?.trim();

  if (output) {
    const outputPath = resolve(output);
    await writeFile(outputPath, `${csv}\n`, "utf8");
    console.log(`Saved ${rows.length} raw measurements to ${outputPath}`);
  } else {
    console.log(csv);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
