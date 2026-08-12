import assert from "node:assert/strict";
import test from "node:test";

import { buildBenchmarkOperationPlan } from "../contracts/scripts/sepolia-benchmark-helpers.ts";

test("builds exactly 68 operations with one warm-up and five recorded rounds", () => {
  const plan = buildBenchmarkOperationPlan("series-fixed");
  assert.equal(plan.length, 68);
  assert.equal(plan.filter((item) => item.kind === "deployment").length, 2);
  assert.equal(plan.filter((item) => item.kind === "individual-registration").length, 60);
  assert.equal(plan.filter((item) => item.kind === "merkle-registration").length, 6);
  assert.equal(plan.filter((item) => item.warmup).length, 11);
});

test("creates unique deterministic 24-character hexadecimal model IDs", () => {
  const plan = buildBenchmarkOperationPlan("series-fixed");
  const ids = plan.flatMap((item) => item.modelIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[0-9a-f]{24}$/.test(id)));
  assert.deepEqual(plan, buildBenchmarkOperationPlan("series-fixed"));
});
