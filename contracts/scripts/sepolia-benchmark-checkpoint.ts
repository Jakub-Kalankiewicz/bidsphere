import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  assertSecretFree,
  type SepoliaBenchmarkResult,
} from "./sepolia-benchmark-helpers";

export async function writeBenchmarkCheckpoint(
  outputPath: string,
  result: SepoliaBenchmarkResult,
  forbiddenValues: readonly string[]
): Promise<void> {
  assertSecretFree(result, forbiddenValues);
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}
