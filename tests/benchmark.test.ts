import assert from "node:assert/strict";
import test from "node:test";

import {
  BENCHMARK_CSV_HEADERS,
  createRunPlan,
  groupBenchmarkSamples,
  parseBenchmarkCsv,
  summarizeMetric,
  toBenchmarkCsv,
  validateVerificationOutcome,
  type BenchmarkSample,
} from "../lib/benchmark.ts";

function sample(overrides: Partial<BenchmarkSample> = {}): BenchmarkSample {
  return {
    timestamp: "2026-08-10T10:00:00.000Z",
    seriesId: "series-a",
    commit: "abc123",
    environmentId: "macbook-test",
    networkProfile: "home-fiber",
    networkEmulated: false,
    connectionType: "ethernet",
    downlinkMbps: 1000,
    rttMs: 8,
    rpcProvider: "localhost",
    rpcStatus: "registered",
    rpcError: "",
    browser: "Chromium test",
    os: "macOS test",
    fileId: "model-1",
    fileName: "Model 1",
    fileSizeBytes: 1024,
    iteration: 1,
    warmup: false,
    status: "success",
    error: "",
    urlSignMs: 1.125,
    serverCdnMs: 2.25,
    clientFetchMs: 3.375,
    proofFetchMs: 4.5,
    sha256Ms: 5.625,
    offlineSha256Ms: 5.75,
    rpcMs: 6.75,
    merkleVerifyMs: 7.875,
    onlineTotalMs: 8.125,
    offlineTotalMs: 9.25,
    proofSizeBytes: 512,
    individualVerified: true,
    merkleVerified: true,
    notes: "",
    ...overrides,
  };
}

test("creates three warmups followed by recorded repetitions", () => {
  assert.deepEqual(createRunPlan(3, 2), [
    { warmup: true, iteration: 1 },
    { warmup: true, iteration: 2 },
    { warmup: true, iteration: 3 },
    { warmup: false, iteration: 1 },
    { warmup: false, iteration: 2 },
  ]);
});

test("rejects invalid run counts", () => {
  assert.throws(() => createRunPlan(-1, 30), /warmups/);
  assert.throws(() => createRunPlan(3, 0), /repetitions/);
  assert.throws(() => createRunPlan(3, 101), /repetitions/);
});

test("calculates type-7 quartiles and p95 from successful recorded samples", () => {
  const samples = [
    sample({ iteration: 1, sha256Ms: 1 }),
    sample({ iteration: 2, sha256Ms: 2 }),
    sample({ iteration: 3, sha256Ms: 3 }),
    sample({ iteration: 4, sha256Ms: 4 }),
    sample({ iteration: 5, sha256Ms: 999, warmup: true }),
    sample({ iteration: 6, sha256Ms: 999, status: "error" }),
  ];

  assert.deepEqual(summarizeMetric(samples, "sha256Ms"), {
    count: 4,
    min: 1,
    q1: 1.75,
    median: 2.5,
    q3: 3.25,
    iqr: 1.5,
    p95: 3.8499999999999996,
    max: 4,
  });
});

test("returns null statistics when a metric has no valid recorded values", () => {
  assert.deepEqual(summarizeMetric([sample({ warmup: true })], "rpcMs"), {
    count: 0,
    min: null,
    q1: null,
    median: null,
    q3: null,
    iqr: null,
    p95: null,
    max: null,
  });
});

test("exports one CSV row per raw sample without rounding durations", () => {
  const csv = toBenchmarkCsv([
    sample({ fileName: "Model, \"quoted\"", notes: "line one\nline two" }),
    sample({ iteration: 2, warmup: true, rpcMs: null, individualVerified: null }),
  ]);
  const lines = csv.split("\r\n");

  assert.equal(lines.length, 3);
  assert.equal(lines[0], BENCHMARK_CSV_HEADERS.join(","));
  assert.match(lines[1], /1\.125/);
  assert.match(lines[1], /"Model, ""quoted"""/);
  assert.match(csv, /"line one\nline two"/);
  assert.match(lines[2], /,true,/);
  assert.doesNotMatch(lines[2], /,null,/);
});

test("round-trips raw CSV including quotes, commas, newlines and null values", () => {
  const samples = [
    sample({ fileName: "Model, \"quoted\"", notes: "line one\nline two" }),
    sample({
      iteration: 2,
      warmup: true,
      downlinkMbps: null,
      rpcMs: null,
      individualVerified: null,
    }),
  ];

  assert.deepEqual(parseBenchmarkCsv(toBenchmarkCsv(samples)), samples);
});

test("groups combined measurements by immutable series identifier", () => {
  const groups = groupBenchmarkSamples([
    sample({ seriesId: "series-a", iteration: 1 }),
    sample({ seriesId: "series-b", iteration: 1, networkProfile: "limited" }),
    sample({ seriesId: "series-a", iteration: 2 }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.seriesId), ["series-a", "series-b"]);
  assert.equal(groups[0].samples.length, 2);
});

test("neutralizes spreadsheet formulas in text fields", () => {
  const csv = toBenchmarkCsv([
    sample({ fileName: "=HYPERLINK(\"https://example.invalid\")", notes: "@SUM(1+1)" }),
  ]);

  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'@SUM/);
});

test("excludes unregistered or negatively verified runs from successful statistics", () => {
  assert.doesNotThrow(() =>
    validateVerificationOutcome({
      rpcStatus: "registered",
      individualVerified: true,
      merkleExpected: true,
      merkleVerified: true,
    })
  );
  assert.throws(
    () =>
      validateVerificationOutcome({
        rpcStatus: "unregistered",
        individualVerified: null,
        merkleExpected: false,
        merkleVerified: null,
      }),
    /not registered/
  );
  assert.throws(
    () =>
      validateVerificationOutcome({
        rpcStatus: "registered",
        individualVerified: false,
        merkleExpected: false,
        merkleVerified: null,
      }),
    /individual integrity mismatch/
  );
  assert.throws(
    () =>
      validateVerificationOutcome({
        rpcStatus: "registered",
        individualVerified: true,
        merkleExpected: true,
        merkleVerified: false,
      }),
    /Merkle integrity mismatch/
  );
});
