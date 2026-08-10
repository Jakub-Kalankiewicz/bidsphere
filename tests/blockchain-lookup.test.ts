import assert from "node:assert/strict";
import test from "node:test";

import { lookupModelOnChain } from "../lib/blockchain-lookup.ts";

test("distinguishes registered, unregistered and unavailable RPC results", async () => {
  const registered = await lookupModelOnChain("model-1", {
    isRegistered: async () => true,
    getModel: async () => [`0x${"12".repeat(32)}`, 123n],
  });
  const unregistered = await lookupModelOnChain("model-1", {
    isRegistered: async () => false,
    getModel: async () => {
      throw new Error("must not be called");
    },
  });
  const unavailable = await lookupModelOnChain("model-1", {
    isRegistered: async () => {
      throw new Error("connection refused");
    },
    getModel: async () => [`0x${"12".repeat(32)}`, 123n],
  });

  assert.deepEqual(registered, {
    status: "registered",
    data: { hash: `0x${"12".repeat(32)}`, timestamp: 123 },
  });
  assert.deepEqual(unregistered, { status: "unregistered" });
  assert.deepEqual(unavailable, {
    status: "unavailable",
    error: "connection refused",
  });
});
