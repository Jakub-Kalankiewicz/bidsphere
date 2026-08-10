const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function hashBytes(hash: string): Uint8Array {
  if (!HASH_PATTERN.test(hash)) {
    throw new TypeError("Merkle hash must be a 0x-prefixed 32-byte hexadecimal value");
  }
  return Uint8Array.from(
    { length: 32 },
    (_, index) => Number.parseInt(hash.slice(2 + index * 2, 4 + index * 2), 16)
  );
}

async function sha256Pair(first: string, second: string): Promise<string> {
  const [left, right] = [first.toLowerCase(), second.toLowerCase()].sort();
  const combined = new Uint8Array(64);
  combined.set(hashBytes(left), 0);
  combined.set(hashBytes(right), 32);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", combined);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    hex += bytes[index].toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
}

export async function verifyProofInBrowser(
  leaf: string,
  proof: readonly string[],
  expectedRoot: string
): Promise<boolean> {
  if (!HASH_PATTERN.test(leaf) || !HASH_PATTERN.test(expectedRoot)) return false;
  let current = leaf.toLowerCase();
  for (const sibling of proof) {
    if (!HASH_PATTERN.test(sibling)) return false;
    current = await sha256Pair(current, sibling);
  }
  return current === expectedRoot.toLowerCase();
}
