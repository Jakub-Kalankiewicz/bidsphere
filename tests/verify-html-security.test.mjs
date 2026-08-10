import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const verifierPath = new URL("../public/verify.html", import.meta.url);

test("offline verifier never renders proof data through innerHTML", async () => {
  const source = await readFile(verifierPath, "utf8");

  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /textContent/);
});

test("offline verifier is a single self-contained file", async () => {
  const source = await readFile(verifierPath, "utf8");

  assert.doesNotMatch(source, /<script[^>]+src=/i);
  assert.doesNotMatch(source, /\bimport\s+/);
  assert.match(source, /function validateProofBundle/);
  assert.match(source, /verifyProofBundle/);
  const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "inline verifier script is missing");
  assert.doesNotThrow(() => new Function(script));
});

test("offline verifier marks bundle metadata as untrusted", async () => {
  const source = await readFile(verifierPath, "utf8");

  assert.match(source, /Untrusted bundle metadata/);
  assert.match(source, /not bound into the Merkle leaf/);
});
