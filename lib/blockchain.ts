import { ethers } from "ethers";
import { createHash } from "crypto";
import artifact from "@/lib/contracts/ModelRegistry.json";

type Artifact = { address: string; abi: ethers.InterfaceAbi };
const { address, abi } = artifact as Artifact;

function getContract(withSigner = false): ethers.Contract {
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL!);

  if (withSigner) {
    const signer = new ethers.Wallet(
      process.env.BLOCKCHAIN_PRIVATE_KEY!,
      provider
    );
    return new ethers.Contract(address, abi, signer);
  }

  return new ethers.Contract(address, abi, provider);
}

/**
 * Fetches a 3D model from its URL and computes its SHA-256 hash.
 * Returns a bytes32-compatible 0x-prefixed hex string (32 bytes = 64 hex chars).
 */
export async function computeModelHash(modelUrl: string): Promise<string> {
  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch model for hashing (${response.status}): ${modelUrl}`
    );
  }
  const buffer = await response.arrayBuffer();
  const hash = createHash("sha256").update(new Uint8Array(buffer)).digest("hex");
  return "0x" + hash;
}

/**
 * Registers a model hash on-chain via the ModelRegistry contract.
 * @param modelId  The AuctionItem MongoDB ID
 * @param hashHex  0x-prefixed 32-byte hex string from computeModelHash()
 * @returns        The transaction hash
 */
export async function registerModelOnChain(
  modelId: string,
  hashHex: string
): Promise<string> {
  const contract = getContract(true);
  const tx = await contract.registerModel(modelId, hashHex as `0x${string}`);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Reads the on-chain hash and registration timestamp for a given modelId.
 * Returns null if not registered or blockchain is unreachable (graceful fallback).
 */
export async function getOnChainData(
  modelId: string
): Promise<{ hash: string; timestamp: number } | null> {
  try {
    const contract = getContract(false);
    const isReg: boolean = await contract.isRegistered(modelId);
    if (!isReg) return null;
    const [hash, timestamp]: [string, bigint] = await contract.getModel(modelId);
    return { hash, timestamp: Number(timestamp) };
  } catch {
    return null;
  }
}
