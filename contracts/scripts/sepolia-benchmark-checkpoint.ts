import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeBenchmarkCheckpoint(
  outputPath: string,
  result: unknown,
  forbiddenValues: readonly string[]
): Promise<void> {
  const { assertSecretFree } = await import(
    `./sepolia-benchmark-helpers${".ts"}`
  );
  assertSecretFree(result, forbiddenValues);
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}
