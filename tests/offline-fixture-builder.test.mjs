import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertLocalFixtureNetwork,
  createOfflineFixtureArtifacts,
  writeOfflineFixtureArtifacts,
} from "../lib/offline-fixture.mjs";
import { verifyProofBundle } from "../public/verify-core.mjs";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

test("allows the fixture transaction only on the fixed local Hardhat endpoint", () => {
  assert.doesNotThrow(() =>
    assertLocalFixtureNetwork("http://127.0.0.1:18545", 31_337)
  );
  assert.throws(
    () => assertLocalFixtureNetwork("https://rpc.sepolia.example", 11_155_111),
    /local fixture endpoint/
  );
  assert.throws(
    () => assertLocalFixtureNetwork("http://127.0.0.1:18545", 11_155_111),
    /local Hardhat chain/
  );
});

function sha256Hex(bytes) {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

test("creates a syntactically valid minimal glTF 2.0 binary", async () => {
  const { glbBytes } = await createOfflineFixtureArtifacts({
    chainId: 31_337,
    contractAddress: CONTRACT_ADDRESS,
    batchId: 1,
    registeredAt: 1_700_000_000,
    generatedAt: "2026-08-12T00:00:00.000Z",
  });

  const view = new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), glbBytes.byteLength);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);

  const jsonLength = view.getUint32(12, true);
  const jsonText = new TextDecoder().decode(glbBytes.subarray(20, 20 + jsonLength)).trimEnd();
  assert.deepEqual(JSON.parse(jsonText), {
    asset: { generator: "BidSphere thesis fixture", version: "2.0" },
    scene: 0,
    scenes: [{}],
  });
});

test("creates a locally verifiable bundle with matching manifest and trust config", async () => {
  const artifacts = await createOfflineFixtureArtifacts({
    chainId: 31_337,
    contractAddress: CONTRACT_ADDRESS,
    batchId: 7,
    registeredAt: 1_700_000_000,
    generatedAt: "2026-08-12T00:00:00.000Z",
  });

  assert.equal(artifacts.bundle.fileHash, sha256Hex(artifacts.glbBytes));
  assert.equal(artifacts.bundle.chainId, 31_337);
  assert.equal(artifacts.bundle.contractAddress, CONTRACT_ADDRESS.toLowerCase());
  assert.equal(artifacts.bundle.batchId, 7);
  assert.equal(artifacts.bundle.totalLeaves, 2);
  assert.equal(artifacts.bundle.merkleProof.length, 1);
  assert.deepEqual(artifacts.verifierConfig, {
    chainId: 31_337,
    contractAddress: CONTRACT_ADDRESS.toLowerCase(),
    trustedRoots: { 7: artifacts.bundle.merkleRoot },
  });
  assert.equal(artifacts.manifest.sha256, artifacts.bundle.fileHash);
  assert.equal(artifacts.manifest.generatedAt, "2026-08-12T00:00:00.000Z");

  const result = await verifyProofBundle(
    artifacts.glbBytes,
    artifacts.bundle,
    artifacts.verifierConfig.trustedRoots,
    artifacts.verifierConfig
  );
  assert.equal(result.accepted, true);
});

test("the bundle rejects a one-byte modification of the generated GLB", async () => {
  const artifacts = await createOfflineFixtureArtifacts({
    chainId: 31_337,
    contractAddress: CONTRACT_ADDRESS,
    batchId: 1,
    registeredAt: 1_700_000_000,
    generatedAt: "2026-08-12T00:00:00.000Z",
  });
  const modified = Uint8Array.from(artifacts.glbBytes);
  modified[modified.length - 1] ^= 0x01;

  const result = await verifyProofBundle(
    modified,
    artifacts.bundle,
    artifacts.verifierConfig.trustedRoots,
    artifacts.verifierConfig
  );
  assert.equal(result.accepted, false);
  assert.equal(result.fileHashMatch, false);
});

test("writes the canonical fixture files without embedding secret configuration", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "bidsphere-offline-fixture-"));
  const artifacts = await createOfflineFixtureArtifacts({
    chainId: 31_337,
    contractAddress: CONTRACT_ADDRESS,
    batchId: 1,
    registeredAt: 1_700_000_000,
    generatedAt: "2026-08-12T00:00:00.000Z",
  });

  await writeOfflineFixtureArtifacts(outputDirectory, artifacts);

  const [glb, bundle, verifierConfig, manifest] = await Promise.all([
    readFile(join(outputDirectory, "minimal-valid.glb")),
    readFile(join(outputDirectory, "proof-bundle.json"), "utf8"),
    readFile(join(outputDirectory, "verifier-config.json"), "utf8"),
    readFile(join(outputDirectory, "manifest.json"), "utf8"),
  ]);
  assert.deepEqual(glb, Buffer.from(artifacts.glbBytes));
  assert.deepEqual(JSON.parse(bundle), artifacts.bundle);
  assert.deepEqual(JSON.parse(verifierConfig), artifacts.verifierConfig);
  assert.deepEqual(JSON.parse(manifest), artifacts.manifest);
  assert.doesNotMatch(`${bundle}${verifierConfig}${manifest}`, /PRIVATE_KEY|RPC_URL|mnemonic/i);
});
