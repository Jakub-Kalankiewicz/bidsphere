import assert from "node:assert/strict";
import test from "node:test";

import {
  getExplorerAddressUrl,
  sha256Hex,
  sha256Pair,
  validateProofBundle,
  verifyProofBundle,
} from "../public/verify-core.mjs";

const encoder = new TextEncoder();
const BAD_HASH = `0x${"ff".repeat(32)}`;
const CONTRACT_ADDRESS = `0x${"12".repeat(20)}`;

test("builds an explorer link only for a recognized public network", () => {
  assert.equal(getExplorerAddressUrl(31_337, CONTRACT_ADDRESS), null);
  assert.equal(
    getExplorerAddressUrl(11_155_111, CONTRACT_ADDRESS),
    `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS.toLowerCase()}`
  );
});

async function twoLeafFixture() {
  const fileBytes = encoder.encode("valid GLB fixture");
  const fileHash = await sha256Hex(fileBytes);
  const sibling = await sha256Hex(encoder.encode("second model"));
  const merkleRoot = await sha256Pair(fileHash, sibling);

  return {
    fileBytes,
    bundle: {
      modelId: "model-1",
      modelName: "Model testowy",
      fileHash,
      batchId: 1,
      merkleRoot,
      merkleProof: [sibling],
      leafIndex: 0,
      totalLeaves: 2,
      registeredAt: 1_700_000_000,
      chainId: 11_155_111,
      contractAddress: CONTRACT_ADDRESS,
    },
  };
}

test("accepts a valid file and proof anchored in the trusted roots table", async () => {
  const { fileBytes, bundle } = await twoLeafFixture();
  const result = await verifyProofBundle(
    fileBytes,
    bundle,
    { 1: bundle.merkleRoot },
    { chainId: bundle.chainId, contractAddress: CONTRACT_ADDRESS }
  );

  assert.equal(result.accepted, true);
  assert.equal(result.fileHashMatch, true);
  assert.equal(result.proofConsistent, true);
  assert.equal(result.rootTrust, "trusted");
});

test("rejects a server-substituted GLB after a successful HTTPS delivery boundary", async () => {
  const { bundle } = await twoLeafFixture();
  // TLS success is represented by a completed transport response. The integrity
  // layer deliberately receives only the delivered bytes and the trusted proof.
  const successfulHttpsResponse = Object.freeze({
    ok: true,
    arrayBuffer: async () => encoder.encode("server-substituted GLB fixture"),
  });
  assert.equal(successfulHttpsResponse.ok, true);
  const result = await verifyProofBundle(
    await successfulHttpsResponse.arrayBuffer(),
    bundle,
    { 1: bundle.merkleRoot },
    { chainId: bundle.chainId, contractAddress: CONTRACT_ADDRESS }
  );

  assert.equal(result.accepted, false);
  assert.equal(result.fileHashMatch, false);
});

test("rejects a modified proof or bundle root", async () => {
  const { fileBytes, bundle } = await twoLeafFixture();
  const proofResult = await verifyProofBundle(
    fileBytes,
    { ...bundle, merkleProof: [BAD_HASH] },
    { 1: bundle.merkleRoot },
    { chainId: bundle.chainId, contractAddress: CONTRACT_ADDRESS }
  );
  const rootResult = await verifyProofBundle(
    fileBytes,
    { ...bundle, merkleRoot: BAD_HASH },
    { 1: bundle.merkleRoot },
    { chainId: bundle.chainId, contractAddress: CONTRACT_ADDRESS }
  );

  assert.equal(proofResult.accepted, false);
  assert.equal(proofResult.proofConsistent, false);
  assert.equal(rootResult.accepted, false);
  assert.equal(rootResult.proofConsistent, false);
});

test("distinguishes an unknown root from a mismatched trusted root", async () => {
  const { fileBytes, bundle } = await twoLeafFixture();
  const config = { chainId: bundle.chainId, contractAddress: CONTRACT_ADDRESS };
  const unknown = await verifyProofBundle(fileBytes, bundle, {}, config);
  const mismatch = await verifyProofBundle(fileBytes, bundle, { 1: BAD_HASH }, config);

  assert.equal(unknown.accepted, false);
  assert.equal(unknown.rootTrust, "unknown");
  assert.equal(mismatch.accepted, false);
  assert.equal(mismatch.rootTrust, "mismatch");
});

test("rejects a leaf index in the duplicated padding zone", async () => {
  const { bundle } = await twoLeafFixture();

  assert.throws(
    () => validateProofBundle({ ...bundle, totalLeaves: 3, leafIndex: 3, merkleProof: [BAD_HASH, BAD_HASH] }),
    /leafIndex must identify a real leaf/
  );
});

test("supports single-leaf and odd-leaf trees", async () => {
  const singleBytes = encoder.encode("single");
  const singleHash = await sha256Hex(singleBytes);
  const singleBundle = {
    modelId: "single",
    modelName: "Single",
    fileHash: singleHash,
    batchId: 2,
    merkleRoot: singleHash,
    merkleProof: [],
    leafIndex: 0,
    totalLeaves: 1,
    registeredAt: 1_700_000_000,
    chainId: 11_155_111,
    contractAddress: CONTRACT_ADDRESS,
  };
  assert.equal(
    (
      await verifyProofBundle(
        singleBytes,
        singleBundle,
        { 2: singleHash },
        { chainId: singleBundle.chainId, contractAddress: CONTRACT_ADDRESS }
      )
    ).accepted,
    true
  );

  const leaves = await Promise.all(
    ["a", "b", "c"].map((value) => sha256Hex(encoder.encode(value)))
  );
  const left = await sha256Pair(leaves[0], leaves[1]);
  const right = await sha256Pair(leaves[2], leaves[2]);
  const oddRoot = await sha256Pair(left, right);
  const oddBundle = {
    ...singleBundle,
    modelId: "odd-c",
    modelName: "Odd C",
    fileHash: leaves[2],
    batchId: 3,
    merkleRoot: oddRoot,
    merkleProof: [leaves[2], left],
    leafIndex: 2,
    totalLeaves: 3,
  };

  assert.equal(
    (
      await verifyProofBundle(
        encoder.encode("c"),
        oddBundle,
        { 3: oddRoot },
        { chainId: oddBundle.chainId, contractAddress: CONTRACT_ADDRESS }
      )
    ).accepted,
    true
  );
});

test("validates hashes, integer fields, proof length, and contract address", async () => {
  const { bundle } = await twoLeafFixture();

  assert.throws(() => validateProofBundle({ ...bundle, fileHash: "0x12" }), /fileHash/);
  assert.throws(() => validateProofBundle({ ...bundle, batchId: 1.5 }), /batchId/);
  assert.throws(() => validateProofBundle({ ...bundle, merkleProof: [] }), /merkleProof length/);
  assert.throws(
    () => validateProofBundle({ ...bundle, contractAddress: "0x1234" }),
    /contractAddress/
  );
});

test("offline verification performs no network request", async () => {
  const { fileBytes, bundle } = await twoLeafFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("network access attempted");
  };

  try {
    const result = await verifyProofBundle(
      fileBytes,
      bundle,
      { 1: bundle.merkleRoot },
      { chainId: bundle.chainId, contractAddress: CONTRACT_ADDRESS }
    );
    assert.equal(result.accepted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a proof from another chain or contract", async () => {
  const { fileBytes, bundle } = await twoLeafFixture();
  const roots = { 1: bundle.merkleRoot };

  const wrongChain = await verifyProofBundle(fileBytes, bundle, roots, {
    chainId: 1,
    contractAddress: CONTRACT_ADDRESS,
  });
  const wrongContract = await verifyProofBundle(fileBytes, bundle, roots, {
    chainId: bundle.chainId,
    contractAddress: `0x${"34".repeat(20)}`,
  });

  assert.equal(wrongChain.accepted, false);
  assert.equal(wrongChain.anchorMatch, false);
  assert.equal(wrongContract.accepted, false);
  assert.equal(wrongContract.anchorMatch, false);
});

test("requires a complete local trust-anchor configuration", async () => {
  const { fileBytes, bundle } = await twoLeafFixture();

  await assert.rejects(
    verifyProofBundle(fileBytes, bundle, { 1: bundle.merkleRoot }, {
      chainId: bundle.chainId,
      contractAddress: "",
    }),
    /configured contractAddress/
  );
});

test("metadata mutation does not change integrity but remains outside the authenticated leaf", async () => {
  const { fileBytes, bundle } = await twoLeafFixture();
  const result = await verifyProofBundle(
    fileBytes,
    {
      ...bundle,
      modelName: "<img src=x onerror=alert(1)>",
      registeredAt: 1,
      leafIndex: 1,
    },
    { 1: bundle.merkleRoot },
    { chainId: bundle.chainId, contractAddress: CONTRACT_ADDRESS }
  );

  assert.equal(result.accepted, true);
  assert.equal(result.metadataAuthenticated, false);
});
