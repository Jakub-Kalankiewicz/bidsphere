import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateProofBundle,
  verifyProofBundle,
} from "../public/verify-core.mjs";

const fixtureDirectory = new URL(
  "./fixtures/offline-verification/local/",
  import.meta.url
);
const BAD_HASH = `0x${"ff".repeat(32)}`;
const OTHER_ADDRESS = `0x${"34".repeat(20)}`;

async function readFixture() {
  const [fileBytes, bundleText, configText, manifestText] = await Promise.all([
    readFile(new URL("minimal-valid.glb", fixtureDirectory)),
    readFile(new URL("proof-bundle.json", fixtureDirectory), "utf8"),
    readFile(new URL("verifier-config.json", fixtureDirectory), "utf8"),
    readFile(new URL("manifest.json", fixtureDirectory), "utf8"),
  ]);
  return {
    fileBytes,
    bundle: JSON.parse(bundleText),
    config: JSON.parse(configText),
    manifest: JSON.parse(manifestText),
  };
}

async function verify(fileBytes, bundle, config) {
  return verifyProofBundle(fileBytes, bundle, config.trustedRoots, config);
}

test("accepts the canonical local GLB and proof bundle", async () => {
  const { fileBytes, bundle, config, manifest } = await readFixture();
  const result = await verify(fileBytes, bundle, config);

  assert.equal(result.accepted, true);
  assert.equal(result.fileHashMatch, true);
  assert.equal(result.proofConsistent, true);
  assert.equal(result.rootTrust, "trusted");
  assert.equal(result.anchorMatch, true);
  assert.equal(manifest.sha256, bundle.fileHash);
  assert.equal(manifest.merkleRoot, bundle.merkleRoot);
  assert.equal(manifest.chainId, config.chainId);
  assert.equal(manifest.contractAddress, config.contractAddress);
});

test("rejects a one-byte modification of the canonical GLB", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const modified = Buffer.from(fileBytes);
  modified[modified.length - 1] ^= 0x01;

  const result = await verify(modified, bundle, config);
  assert.equal(result.accepted, false);
  assert.equal(result.fileHashMatch, false);
});

test("rejects a changed file hash", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const result = await verify(fileBytes, { ...bundle, fileHash: BAD_HASH }, config);

  assert.equal(result.accepted, false);
  assert.equal(result.fileHashMatch, false);
});

test("rejects a changed proof sibling and a changed bundle root", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const proofResult = await verify(
    fileBytes,
    { ...bundle, merkleProof: [BAD_HASH] },
    config
  );
  const rootResult = await verify(
    fileBytes,
    { ...bundle, merkleRoot: BAD_HASH },
    config
  );

  assert.equal(proofResult.accepted, false);
  assert.equal(proofResult.proofConsistent, false);
  assert.equal(rootResult.accepted, false);
  assert.equal(rootResult.proofConsistent, false);
});

test("rejects an unknown trusted root", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const result = await verifyProofBundle(fileBytes, bundle, {}, config);

  assert.equal(result.accepted, false);
  assert.equal(result.rootTrust, "unknown");
});

test("rejects a different configured chain", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const result = await verify(fileBytes, bundle, {
    ...config,
    chainId: config.chainId + 1,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.anchorMatch, false);
});

test("rejects a different configured contract address", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const result = await verify(fileBytes, bundle, {
    ...config,
    contractAddress: OTHER_ADDRESS,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.anchorMatch, false);
});

test("rejects malformed JSON, an empty file, and an excessive proof", async () => {
  const { bundle, config } = await readFixture();
  assert.throws(() => JSON.parse("{"), SyntaxError);

  const emptyResult = await verify(new Uint8Array(), bundle, config);
  assert.equal(emptyResult.accepted, false);
  assert.equal(emptyResult.fileHashMatch, false);

  assert.throws(
    () => validateProofBundle({ ...bundle, merkleProof: Array(65).fill(BAD_HASH) }),
    /cannot contain more than 64 hashes/
  );
});

test("keeps HTML-like model metadata outside the authenticated leaf", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const result = await verify(
    fileBytes,
    { ...bundle, modelName: "<img src=x onerror=alert(1)>" },
    config
  );

  assert.equal(result.accepted, true);
  assert.equal(result.metadataAuthenticated, false);
});

test("accepts the canonical fixture with network access disabled", async () => {
  const { fileBytes, bundle, config } = await readFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("network access attempted");
  };

  try {
    const result = await verify(fileBytes, bundle, config);
    assert.equal(result.accepted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
