import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSepoliaPreflightInputs,
  assertGasEstimateWithinLimit,
  buildSepoliaFixture,
  estimateSmokeMinimumBalance,
  SEPOLIA_SMOKE_GAS_LIMITS,
} from "../contracts/scripts/sepolia-smoke-helpers.ts";
import { verifyProofBundle } from "../public/verify-core.mjs";

test("requires a dedicated Sepolia RPC URL and test wallet", () => {
  assert.throws(
    () =>
      assertSepoliaPreflightInputs("sepolia", 11_155_111n, {
        BLOCKCHAIN_PRIVATE_KEY: "present",
      }),
    /SEPOLIA_RPC_URL is required/
  );
  assert.throws(
    () =>
      assertSepoliaPreflightInputs("sepolia", 11_155_111n, {
        SEPOLIA_RPC_URL: "present",
      }),
    /BLOCKCHAIN_PRIVATE_KEY is required/
  );
});

test("rejects a network other than Sepolia before any transaction", () => {
  assert.throws(
    () =>
      assertSepoliaPreflightInputs("localhost", 31_337n, {
        SEPOLIA_RPC_URL: "present",
        BLOCKCHAIN_PRIVATE_KEY: "present",
      }),
    /Sepolia network/
  );
});

test("derives a bounded balance requirement from the current fee", () => {
  const totalGas = Object.values(SEPOLIA_SMOKE_GAS_LIMITS).reduce(
    (sum, value) => sum + value,
    0n
  );
  assert.equal(estimateSmokeMinimumBalance(2n), 2n * totalGas);
  assert.doesNotThrow(() => assertGasEstimateWithinLimit(99n, 100n, "test"));
  assert.throws(
    () => assertGasEstimateWithinLimit(101n, 100n, "test"),
    /exceeds the configured gas ceiling/
  );
});

test("allows the observed Sepolia deployment estimate within the safety ceiling", () => {
  const observedDeploymentEstimate = 1_252_536n;

  assert.doesNotThrow(() =>
    assertGasEstimateWithinLimit(
      observedDeploymentEstimate,
      SEPOLIA_SMOKE_GAS_LIMITS.deployment,
      "contract deployment"
    )
  );
});

test("uses the production verifier for the full Sepolia trust context", async () => {
  const fixture = buildSepoliaFixture();
  assert.equal(fixture.bytes.subarray(0, 4).toString("utf8"), "glTF");
  const contractAddress = "0x1111111111111111111111111111111111111111";
  const proofBundle = {
    modelId: fixture.modelId,
    modelName: "Sepolia smoke fixture",
    fileHash: fixture.fileHash,
    batchId: 1,
    merkleRoot: fixture.merkleRoot,
    merkleProof: fixture.merkleProof,
    leafIndex: fixture.leafIndex,
    totalLeaves: fixture.totalLeaves,
    registeredAt: 1,
    chainId: 11_155_111,
    contractAddress,
  };
  const config = { chainId: 11_155_111, contractAddress };
  const roots = { 1: fixture.merkleRoot };

  assert.equal(
    (await verifyProofBundle(fixture.bytes, proofBundle, roots, config)).accepted,
    true
  );

  const modified = Buffer.from(fixture.bytes);
  modified[modified.length - 1] ^= 1;
  assert.equal(
    (await verifyProofBundle(modified, proofBundle, roots, config)).accepted,
    false
  );
  assert.equal(
    (
      await verifyProofBundle(fixture.bytes, proofBundle, roots, {
        ...config,
        chainId: 31_337,
      })
    ).accepted,
    false
  );
  assert.equal(
    (
      await verifyProofBundle(fixture.bytes, proofBundle, roots, {
        ...config,
        contractAddress: "0x2222222222222222222222222222222222222222",
      })
    ).accepted,
    false
  );
  assert.equal(
    (await verifyProofBundle(fixture.bytes, proofBundle, {}, config)).accepted,
    false
  );
});
