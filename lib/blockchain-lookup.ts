export interface ModelRegistryReader {
  isRegistered(modelId: string): Promise<boolean>;
  getModel(modelId: string): Promise<readonly [string, bigint]>;
}

export type OnChainLookupResult =
  | { status: "registered"; data: { hash: string; timestamp: number } }
  | { status: "unregistered" }
  | { status: "unavailable"; error: string };

export async function lookupModelOnChain(
  modelId: string,
  registry: ModelRegistryReader
): Promise<OnChainLookupResult> {
  try {
    if (!(await registry.isRegistered(modelId))) {
      return { status: "unregistered" };
    }
    const [hash, timestamp] = await registry.getModel(modelId);
    return {
      status: "registered",
      data: { hash, timestamp: Number(timestamp) },
    };
  } catch (error) {
    return {
      status: "unavailable",
      error: error instanceof Error ? error.message : "Unknown RPC error",
    };
  }
}
