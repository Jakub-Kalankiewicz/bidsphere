import { sha256Hex, sha256Pair } from "../public/verify-core.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const encoder = new TextEncoder();

export function assertLocalFixtureNetwork(rpcUrl, chainId) {
  if (rpcUrl !== "http://127.0.0.1:18545") {
    throw new Error("The local fixture endpoint must be http://127.0.0.1:18545");
  }
  if (chainId !== 31_337) {
    throw new Error("The local fixture transaction requires the local Hardhat chain");
  }
}

function createMinimalGlb() {
  const json = JSON.stringify({
    asset: { generator: "BidSphere thesis fixture", version: "2.0" },
    scene: 0,
    scenes: [{}],
  });
  const jsonBytes = encoder.encode(json);
  const paddedJsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const totalLength = 12 + 8 + paddedJsonLength;
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.byteLength);

  return bytes;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
}

export async function createOfflineFixtureArtifacts({
  chainId,
  contractAddress,
  batchId,
  registeredAt,
  generatedAt,
}) {
  requirePositiveInteger(chainId, "chainId");
  requirePositiveInteger(batchId, "batchId");
  requirePositiveInteger(registeredAt, "registeredAt");
  if (!ADDRESS_PATTERN.test(contractAddress)) {
    throw new TypeError("contractAddress must be a 0x-prefixed 20-byte address");
  }

  const normalizedAddress = contractAddress.toLowerCase();
  const glbBytes = createMinimalGlb();
  const fileHash = await sha256Hex(glbBytes);
  const siblingHash = await sha256Hex(
    encoder.encode("BidSphere deterministic local fixture sibling")
  );
  const merkleRoot = await sha256Pair(fileHash, siblingHash);
  const bundle = {
    modelId: "000000000000000000000001",
    modelName: "Minimalny model testowy GLB",
    fileHash,
    batchId,
    merkleRoot,
    merkleProof: [siblingHash],
    leafIndex: 0,
    totalLeaves: 2,
    registeredAt,
    chainId,
    contractAddress: normalizedAddress,
  };
  const verifierConfig = {
    chainId,
    contractAddress: normalizedAddress,
    trustedRoots: { [batchId]: merkleRoot },
  };
  const manifest = {
    fixtureId: "bidsphere-local-offline-v1",
    fileName: "minimal-valid.glb",
    proofBundleFile: "proof-bundle.json",
    verifierConfigFile: "verifier-config.json",
    sha256: fileHash,
    merkleRoot,
    batchId,
    totalLeaves: 2,
    chainId,
    contractAddress: normalizedAddress,
    generatedAt,
    generationCommand: "npm run fixture:offline",
  };

  return { glbBytes, bundle, verifierConfig, manifest };
}

export async function writeOfflineFixtureArtifacts(outputDirectory, artifacts) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(outputDirectory, "minimal-valid.glb"), artifacts.glbBytes),
    writeFile(
      join(outputDirectory, "proof-bundle.json"),
      `${JSON.stringify(artifacts.bundle, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      join(outputDirectory, "verifier-config.json"),
      `${JSON.stringify(artifacts.verifierConfig, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      join(outputDirectory, "manifest.json"),
      `${JSON.stringify(artifacts.manifest, null, 2)}\n`,
      "utf8"
    ),
  ]);
}
