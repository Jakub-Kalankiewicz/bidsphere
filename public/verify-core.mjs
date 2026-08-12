const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MAX_PROOF_DEPTH = 64;

function assertPlainObject(value, label = "proof bundle") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
}

function assertString(value, field, maxLength) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${field} must be a non-empty string up to ${maxLength} characters`);
  }
}

function assertInteger(value, field, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${field} must be an integer greater than or equal to ${minimum}`);
  }
}

function assertHash(value, field) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a 0x-prefixed 32-byte hexadecimal value`);
  }
}

function expectedProofDepth(totalLeaves) {
  if (totalLeaves === 1) return 0;
  return Math.ceil(Math.log2(totalLeaves));
}

export function validateProofBundle(value) {
  assertPlainObject(value);
  assertString(value.modelId, "modelId", 256);
  assertString(value.modelName, "modelName", 512);
  assertHash(value.fileHash, "fileHash");
  assertInteger(value.batchId, "batchId", 1);
  assertHash(value.merkleRoot, "merkleRoot");
  assertInteger(value.leafIndex, "leafIndex", 0);
  assertInteger(value.totalLeaves, "totalLeaves", 1);
  assertInteger(value.registeredAt, "registeredAt", 0);
  assertInteger(value.chainId, "chainId", 1);

  if (!Array.isArray(value.merkleProof)) {
    throw new TypeError("merkleProof must be an array");
  }
  if (value.merkleProof.length > MAX_PROOF_DEPTH) {
    throw new RangeError(`merkleProof cannot contain more than ${MAX_PROOF_DEPTH} hashes`);
  }
  for (const [index, hash] of value.merkleProof.entries()) {
    assertHash(hash, `merkleProof[${index}]`);
  }
  if (value.leafIndex >= value.totalLeaves) {
    throw new RangeError("leafIndex must identify a real leaf and cannot point into the padding zone");
  }

  const requiredDepth = expectedProofDepth(value.totalLeaves);
  if (value.merkleProof.length !== requiredDepth) {
    throw new RangeError(
      `merkleProof length must be ${requiredDepth} for ${value.totalLeaves} real leaves`
    );
  }

  if (
    typeof value.contractAddress !== "string" ||
    (value.contractAddress !== "" && !ADDRESS_PATTERN.test(value.contractAddress))
  ) {
    throw new TypeError("contractAddress must be empty or a 0x-prefixed 20-byte address");
  }

  return Object.freeze({
    modelId: value.modelId,
    modelName: value.modelName,
    fileHash: value.fileHash.toLowerCase(),
    batchId: value.batchId,
    merkleRoot: value.merkleRoot.toLowerCase(),
    merkleProof: Object.freeze(value.merkleProof.map((hash) => hash.toLowerCase())),
    leafIndex: value.leafIndex,
    totalLeaves: value.totalLeaves,
    registeredAt: value.registeredAt,
    chainId: value.chainId,
    contractAddress: value.contractAddress.toLowerCase(),
  });
}

export function validateVerifierConfig(value) {
  assertPlainObject(value, "verifier configuration");
  assertInteger(value.chainId, "configured chainId", 1);
  if (typeof value.contractAddress !== "string" || !ADDRESS_PATTERN.test(value.contractAddress)) {
    throw new TypeError(
      "configured contractAddress must be a non-empty 0x-prefixed 20-byte address"
    );
  }
  return Object.freeze({
    chainId: value.chainId,
    contractAddress: value.contractAddress.toLowerCase(),
  });
}

export function getExplorerAddressUrl(chainId, contractAddress) {
  if (chainId !== 11_155_111 || !ADDRESS_PATTERN.test(contractAddress)) {
    return null;
  }
  return `https://sepolia.etherscan.io/address/${contractAddress.toLowerCase()}`;
}

function hexToBytes(hash) {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hash.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return bytes;
}

export async function sha256Hex(data) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return `0x${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

export async function sha256Pair(first, second) {
  assertHash(first, "first hash");
  assertHash(second, "second hash");
  const [left, right] = [first.toLowerCase(), second.toLowerCase()].sort();
  const combined = new Uint8Array(64);
  combined.set(hexToBytes(left), 0);
  combined.set(hexToBytes(right), 32);
  return sha256Hex(combined);
}

export async function computeMerkleRoot(leaf, proof) {
  let current = leaf.toLowerCase();
  for (const sibling of proof) {
    current = await sha256Pair(current, sibling);
  }
  return current;
}

export async function verifyProofBundle(fileBytes, proofInput, trustedRoots, verifierConfig) {
  const proof = validateProofBundle(proofInput);
  assertPlainObject(trustedRoots, "trusted roots table");
  const config = validateVerifierConfig(verifierConfig);

  const computedHash = await sha256Hex(fileBytes);
  const derivedRoot = await computeMerkleRoot(computedHash, proof.merkleProof);
  const fileHashMatch = computedHash === proof.fileHash;
  const proofConsistent = derivedRoot === proof.merkleRoot;
  const configuredRoot = trustedRoots[proof.batchId];

  let rootTrust = "unknown";
  if (configuredRoot !== undefined) {
    rootTrust =
      typeof configuredRoot === "string" &&
      HASH_PATTERN.test(configuredRoot) &&
      configuredRoot.toLowerCase() === derivedRoot
        ? "trusted"
        : "mismatch";
  }
  const anchorMatch =
    proof.chainId === config.chainId && proof.contractAddress === config.contractAddress;

  return Object.freeze({
    accepted: fileHashMatch && proofConsistent && rootTrust === "trusted" && anchorMatch,
    computedHash,
    derivedRoot,
    fileHashMatch,
    proofConsistent,
    rootTrust,
    anchorMatch,
    metadataAuthenticated: false,
    proof,
  });
}
