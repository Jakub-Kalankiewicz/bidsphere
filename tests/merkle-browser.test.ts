import assert from "node:assert/strict";
import test from "node:test";

import { verifyProofInBrowser } from "../lib/merkle-browser.ts";

const encoder = new TextEncoder();

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return `0x${Buffer.from(digest).toString("hex")}`;
}

async function pair(first: string, second: string): Promise<string> {
  const [left, right] = [first, second].sort();
  return sha256(
    Uint8Array.from(Buffer.from(`${left.slice(2)}${right.slice(2)}`, "hex"))
  );
}

test("verifies a sorted-pair Merkle proof with Web Crypto", async () => {
  const leaf = await sha256(encoder.encode("model-a"));
  const sibling = await sha256(encoder.encode("model-b"));
  const root = await pair(leaf, sibling);

  assert.equal(await verifyProofInBrowser(leaf, [sibling], root), true);
  assert.equal(await verifyProofInBrowser(leaf, [sibling], `0x${"ff".repeat(32)}`), false);
});
