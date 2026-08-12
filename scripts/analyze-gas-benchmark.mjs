import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/analyze-gas-benchmark.mjs <input.csv> <output.json>");
}

const lines = (await readFile(inputPath, "utf8")).trim().split(/\r?\n/);
const rows = lines.slice(1).map((line) => {
  const values = line.split(",");
  return {
    batchSize: Number(values[3]),
    individualTotalGas: Number(values[5]),
    merkleBatchGas: Number(values[6]),
    individualGasPerModel: Number(values[7]),
    merkleGasPerModel: Number(values[8]),
  };
});

function quantile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(values) {
  return {
    count: values.length,
    q1: quantile(values, 0.25),
    median: quantile(values, 0.5),
    q3: quantile(values, 0.75),
    p95: quantile(values, 0.95),
  };
}

const batchSizes = [...new Set(rows.map((row) => row.batchSize))].sort((a, b) => a - b);
const batches = batchSizes.map((batchSize) => {
  const batch = rows.filter((row) => row.batchSize === batchSize);
  const individual = summarize(batch.map((row) => row.individualTotalGas));
  const merkle = summarize(batch.map((row) => row.merkleBatchGas));
  const individualPerModel = summarize(batch.map((row) => row.individualGasPerModel));
  const merklePerModel = summarize(batch.map((row) => row.merkleGasPerModel));
  return {
    batchSize,
    repetitions: batch.length,
    individualTotalGas: individual,
    merkleBatchGas: merkle,
    individualGasPerModel: individualPerModel,
    merkleGasPerModel: merklePerModel,
    medianPerModelSavingPct:
      100 * (1 - merklePerModel.median / individualPerModel.median),
  };
});

const result = {
  source: inputPath,
  generatedAt: new Date().toISOString(),
  quantileMethod: "Hyndman-Fan type 7 (linear interpolation)",
  rows: rows.length,
  batchSizes,
  batches,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Saved gas benchmark summary to ${outputPath}`);
