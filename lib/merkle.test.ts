import assert from "node:assert/strict";
import test from "node:test";

import { buildMerkleTree, generateProof, verifyProof } from "./merkle.ts";

const leaves = [
  `0x${"aa".repeat(32)}`,
  `0x${"bb".repeat(32)}`,
  `0x${"cc".repeat(32)}`,
  `0x${"dd".repeat(32)}`,
];

test("builds a deterministic root and verifies every real leaf", () => {
  const tree = buildMerkleTree(leaves);

  assert.match(tree.root, /^0x[0-9a-f]{64}$/);
  assert.equal(tree.totalLeaves, leaves.length);
  for (const [index, leaf] of leaves.entries()) {
    const proof = generateProof(tree, index);
    assert.equal(
      verifyProof(leaf, proof.proof, proof.leafIndex, tree.totalLeaves, tree.root),
      true
    );
  }
});

test("rejects a tampered leaf", () => {
  const tree = buildMerkleTree(leaves);
  const proof = generateProof(tree, 0);

  assert.equal(
    verifyProof(
      `0x${"ff".repeat(32)}`,
      proof.proof,
      proof.leafIndex,
      tree.totalLeaves,
      tree.root
    ),
    false
  );
});

test("rejects proof generation and verification in the duplicated padding zone", () => {
  const oddLeaves = leaves.slice(0, 3);
  const tree = buildMerkleTree(oddLeaves);

  assert.equal(tree.totalLeaves, 3);
  assert.throws(() => generateProof(tree, 3), /out of range/);
  assert.equal(verifyProof(oddLeaves[2], [], 3, tree.totalLeaves, tree.root), false);
});

test("supports a single-leaf tree", () => {
  const tree = buildMerkleTree([leaves[0]]);
  const proof = generateProof(tree, 0);

  assert.equal(
    verifyProof(leaves[0], proof.proof, 0, tree.totalLeaves, tree.root),
    true
  );
});
