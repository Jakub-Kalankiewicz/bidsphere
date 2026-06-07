// Run with: npx ts-node lib/merkle.test.ts
import { buildMerkleTree, generateProof, verifyProof } from "./merkle";

const leaves = [
  "0x" + "aa".repeat(32),
  "0x" + "bb".repeat(32),
  "0x" + "cc".repeat(32),
  "0x" + "dd".repeat(32),
];

const tree = buildMerkleTree(leaves);

// Root is deterministic
console.assert(tree.root.startsWith("0x"), "root should be 0x-prefixed");
console.assert(tree.root.length === 66, "root should be 32 bytes");
console.assert(tree.totalLeaves === 4, "totalLeaves should match unpadded count");

// Proof verifies for each real leaf
for (let i = 0; i < leaves.length; i++) {
  const proof = generateProof(tree, i);
  const valid = verifyProof(leaves[i], proof.proof, proof.leafIndex, tree.totalLeaves, tree.root);
  console.assert(valid, `proof for leaf ${i} should verify`);
}

// Tampered leaf fails
const badProof = generateProof(tree, 0);
const tampered = verifyProof("0x" + "ff".repeat(32), badProof.proof, 0, tree.totalLeaves, tree.root);
console.assert(!tampered, "tampered leaf should not verify");

// CVE-2012-2459 guard: generateProof rejects pad-zone index
const oddLeaves = ["0x" + "aa".repeat(32), "0x" + "bb".repeat(32), "0x" + "cc".repeat(32)];
const oddTree = buildMerkleTree(oddLeaves); // padded to 4
console.assert(oddTree.totalLeaves === 3, "totalLeaves should be 3 for odd input");
try {
  generateProof(oddTree, 3); // index 3 is a ghost pad entry
  console.assert(false, "should have thrown for pad-zone index");
} catch (e) {
  console.assert((e as Error).message.includes("out of range"), "error message should say out of range");
}
// verifyProof also rejects pad-zone index directly
const ghostValid = verifyProof("0x" + "cc".repeat(32), [], 3, oddTree.totalLeaves, oddTree.root);
console.assert(!ghostValid, "verifyProof should reject pad-zone leafIndex");

// Single leaf tree
const singleTree = buildMerkleTree(["0x" + "aa".repeat(32)]);
const singleProof = generateProof(singleTree, 0);
const singleValid = verifyProof("0x" + "aa".repeat(32), singleProof.proof, 0, singleTree.totalLeaves, singleTree.root);
console.assert(singleValid, "single-leaf proof should verify");

console.log("All merkle.ts tests passed.");
