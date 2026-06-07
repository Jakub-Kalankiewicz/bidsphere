import { createHash } from "crypto";

export type HexHash = string; // 0x-prefixed 32-byte hex

function sha256pair(a: HexHash, b: HexHash): HexHash {
  // Always sort so tree is deterministic regardless of insertion order
  const [left, right] = a <= b ? [a, b] : [b, a];
  const buf = Buffer.concat([
    Buffer.from(left.slice(2), "hex"),
    Buffer.from(right.slice(2), "hex"),
  ]);
  return "0x" + createHash("sha256").update(buf).digest("hex");
}

export interface MerkleTree {
  root: HexHash;
  leaves: HexHash[]; // ordered, padded to power-of-2 length
  totalLeaves: number; // unpadded count — used to guard against duplicate-leaf attacks (CVE-2012-2459)
}

export interface MerkleProof {
  leafIndex: number;
  proof: HexHash[]; // sibling hashes from leaf to root
}

/** Pad leaves array to the next power of 2 by duplicating the last leaf. */
function padToPowerOf2(leaves: HexHash[]): HexHash[] {
  if (leaves.length === 0) throw new Error("Cannot build tree from empty leaves");
  let n = 1;
  while (n < leaves.length) n *= 2;
  const padded = [...leaves];
  while (padded.length < n) padded.push(padded[padded.length - 1]);
  return padded;
}

export function buildMerkleTree(rawLeaves: HexHash[]): MerkleTree {
  const totalLeaves = rawLeaves.length; // preserve unpadded count before padding
  const leaves = padToPowerOf2(rawLeaves);
  let level = leaves;
  while (level.length > 1) {
    const next: HexHash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256pair(level[i], level[i + 1]));
    }
    level = next;
  }
  return { root: level[0], leaves, totalLeaves };
}

export function generateProof(tree: MerkleTree, leafIndex: number): MerkleProof {
  // Guard: reject pad-zone indices to prevent duplicate-leaf attacks (CVE-2012-2459)
  if (leafIndex >= tree.totalLeaves) {
    throw new Error(`leafIndex ${leafIndex} is out of range for ${tree.totalLeaves} real leaves`);
  }
  const leaves = [...tree.leaves];
  const proof: HexHash[] = [];
  let index = leafIndex;
  let level = leaves;
  while (level.length > 1) {
    const sibling = index % 2 === 0 ? level[index + 1] : level[index - 1];
    proof.push(sibling);
    const next: HexHash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256pair(level[i], level[i + 1]));
    }
    level = next;
    index = Math.floor(index / 2);
  }
  return { leafIndex, proof };
}

export function verifyProof(
  leaf: HexHash,
  proof: HexHash[],
  leafIndex: number,
  totalLeaves: number,
  expectedRoot: HexHash
): boolean {
  // Guard against duplicate-leaf attacks (CVE-2012-2459):
  // a padded ghost entry at index >= totalLeaves would produce a valid-looking
  // proof but refers to no real model — reject it here as a second gate.
  if (leafIndex >= totalLeaves) return false;
  let current = leaf;
  let index = leafIndex;
  for (const sibling of proof) {
    current = sha256pair(current, sibling);
    index = Math.floor(index / 2);
  }
  return current.toLowerCase() === expectedRoot.toLowerCase();
}
