export interface ProofBundle {
  modelId: string;
  modelName: string;
  fileHash: string;
  batchId: number;
  merkleRoot: string;
  merkleProof: string[];
  leafIndex: number;
  totalLeaves: number;
  registeredAt: number;
  chainId: number;
  contractAddress: string;
}

export interface VerifierConfig {
  chainId: number;
  contractAddress: string;
}

export interface VerificationResult {
  accepted: boolean;
  fileHashMatch: boolean;
  proofConsistent: boolean;
  rootTrust: "unknown" | "mismatch" | "trusted";
  anchorMatch: boolean;
}

export function verifyProofBundle(
  fileBytes: Uint8Array,
  proofInput: ProofBundle,
  trustedRoots: Record<number, string>,
  verifierConfig: VerifierConfig
): Promise<VerificationResult>;
