export type BenchmarkStatus = "success" | "error";

export interface BenchmarkSample {
  timestamp: string;
  seriesId: string;
  commit: string;
  environmentId: string;
  networkProfile: string;
  networkEmulated: boolean;
  connectionType: string;
  downlinkMbps: number | null;
  rttMs: number | null;
  rpcProvider: string;
  rpcStatus: "registered" | "unregistered" | "unavailable" | "";
  rpcError: string;
  browser: string;
  os: string;
  fileId: string;
  fileName: string;
  fileSizeBytes: number | null;
  iteration: number;
  warmup: boolean;
  status: BenchmarkStatus;
  error: string;
  urlSignMs: number | null;
  serverCdnMs: number | null;
  clientFetchMs: number | null;
  proofFetchMs: number | null;
  sha256Ms: number | null;
  offlineSha256Ms: number | null;
  rpcMs: number | null;
  merkleVerifyMs: number | null;
  onlineTotalMs: number | null;
  offlineTotalMs: number | null;
  proofSizeBytes: number | null;
  individualVerified: boolean | null;
  merkleVerified: boolean | null;
  notes: string;
}

export interface RunPlanEntry {
  warmup: boolean;
  iteration: number;
}

export interface MetricSummary {
  count: number;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  iqr: number | null;
  p95: number | null;
  max: number | null;
}

export interface BenchmarkGroup {
  seriesId: string;
  samples: BenchmarkSample[];
}

export interface VerificationOutcome {
  rpcStatus: BenchmarkSample["rpcStatus"];
  individualVerified: boolean | null;
  merkleExpected: boolean;
  merkleVerified: boolean | null;
}

export function validateVerificationOutcome(outcome: VerificationOutcome): void {
  if (outcome.rpcStatus === "unavailable" || outcome.rpcStatus === "") {
    throw new Error("RPC verification was not completed");
  }
  if (outcome.rpcStatus === "unregistered") {
    throw new Error("Model is not registered on-chain");
  }
  if (outcome.individualVerified !== true) {
    throw new Error("Detected individual integrity mismatch");
  }
  if (outcome.merkleExpected && outcome.merkleVerified !== true) {
    throw new Error("Detected Merkle integrity mismatch");
  }
}

type NumericMetric = {
  [Key in keyof BenchmarkSample]: BenchmarkSample[Key] extends number | null ? Key : never;
}[keyof BenchmarkSample];

export const BENCHMARK_CSV_HEADERS = [
  "timestamp",
  "series_id",
  "commit",
  "environment_id",
  "network_profile",
  "network_emulated",
  "connection_type",
  "downlink_mbps",
  "rtt_ms",
  "rpc_provider",
  "rpc_status",
  "rpc_error",
  "browser",
  "os",
  "file_id",
  "file_name",
  "file_size_bytes",
  "iteration",
  "warmup",
  "status",
  "error",
  "url_sign_ms",
  "server_cdn_ms",
  "client_fetch_ms",
  "proof_fetch_ms",
  "sha256_ms",
  "offline_sha256_ms",
  "rpc_ms",
  "merkle_verify_ms",
  "online_total_ms",
  "offline_total_ms",
  "proof_size_bytes",
  "individual_verified",
  "merkle_verified",
  "notes",
] as const;

const SAMPLE_FIELDS: readonly (keyof BenchmarkSample)[] = [
  "timestamp",
  "seriesId",
  "commit",
  "environmentId",
  "networkProfile",
  "networkEmulated",
  "connectionType",
  "downlinkMbps",
  "rttMs",
  "rpcProvider",
  "rpcStatus",
  "rpcError",
  "browser",
  "os",
  "fileId",
  "fileName",
  "fileSizeBytes",
  "iteration",
  "warmup",
  "status",
  "error",
  "urlSignMs",
  "serverCdnMs",
  "clientFetchMs",
  "proofFetchMs",
  "sha256Ms",
  "offlineSha256Ms",
  "rpcMs",
  "merkleVerifyMs",
  "onlineTotalMs",
  "offlineTotalMs",
  "proofSizeBytes",
  "individualVerified",
  "merkleVerified",
  "notes",
];

export function createRunPlan(warmups: number, repetitions: number): RunPlanEntry[] {
  if (!Number.isInteger(warmups) || warmups < 0 || warmups > 10) {
    throw new RangeError("warmups must be an integer between 0 and 10");
  }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
    throw new RangeError("repetitions must be an integer between 1 and 100");
  }

  return [
    ...Array.from({ length: warmups }, (_, index) => ({
      warmup: true,
      iteration: index + 1,
    })),
    ...Array.from({ length: repetitions }, (_, index) => ({
      warmup: false,
      iteration: index + 1,
    })),
  ];
}

function quantileType7(sorted: readonly number[], probability: number): number {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * fraction;
}

export function summarizeMetric(
  samples: readonly BenchmarkSample[],
  metric: NumericMetric
): MetricSummary {
  const values = samples
    .filter((sample) => !sample.warmup && sample.status === "success")
    .map((sample) => sample[metric])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return { count: 0, min: null, q1: null, median: null, q3: null, iqr: null, p95: null, max: null };
  }

  const q1 = quantileType7(values, 0.25);
  const q3 = quantileType7(values, 0.75);
  return {
    count: values.length,
    min: values[0],
    q1,
    median: quantileType7(values, 0.5),
    q3,
    iqr: q3 - q1,
    p95: quantileType7(values, 0.95),
    max: values[values.length - 1],
  };
}

export function groupBenchmarkSamples(
  samples: readonly BenchmarkSample[]
): BenchmarkGroup[] {
  const groups = new Map<string, BenchmarkSample[]>();
  for (const sample of samples) {
    if (!sample.seriesId) {
      throw new Error("Every benchmark sample must have a non-empty seriesId");
    }
    const group = groups.get(sample.seriesId);
    if (group) group.push(sample);
    else groups.set(sample.seriesId, [sample]);
  }
  return Array.from(groups, ([seriesId, groupedSamples]) => ({
    seriesId,
    samples: groupedSamples,
  }));
}

function escapeCsv(value: BenchmarkSample[keyof BenchmarkSample]): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const text =
    typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toBenchmarkCsv(samples: readonly BenchmarkSample[]): string {
  const rows = samples.map((sample) =>
    SAMPLE_FIELDS.map((field) => escapeCsv(sample[field])).join(",")
  );
  return [BENCHMARK_CSV_HEADERS.join(","), ...rows].join("\r\n");
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const NULLABLE_NUMBER_FIELDS = new Set<keyof BenchmarkSample>([
  "downlinkMbps",
  "rttMs",
  "fileSizeBytes",
  "urlSignMs",
  "serverCdnMs",
  "clientFetchMs",
  "proofFetchMs",
  "sha256Ms",
  "offlineSha256Ms",
  "rpcMs",
  "merkleVerifyMs",
  "onlineTotalMs",
  "offlineTotalMs",
  "proofSizeBytes",
]);

const BOOLEAN_FIELDS = new Set<keyof BenchmarkSample>(["networkEmulated", "warmup"]);
const NULLABLE_BOOLEAN_FIELDS = new Set<keyof BenchmarkSample>([
  "individualVerified",
  "merkleVerified",
]);

function parseBoolean(value: string, field: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${field} must contain true or false`);
}

export function parseBenchmarkCsv(csv: string): BenchmarkSample[] {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) throw new Error("CSV is empty");
  if (
    rows[0].length !== BENCHMARK_CSV_HEADERS.length ||
    rows[0].some((header, index) => header !== BENCHMARK_CSV_HEADERS[index])
  ) {
    throw new Error("CSV header does not match the BidSphere benchmark format");
  }

  return rows.slice(1).map((row, rowIndex) => {
    if (row.length !== SAMPLE_FIELDS.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${row.length} fields; expected ${SAMPLE_FIELDS.length}`);
    }
    const sample = {} as BenchmarkSample;
    const mutable = sample as unknown as Record<string, unknown>;

    for (const [index, field] of SAMPLE_FIELDS.entries()) {
      const value = row[index];
      if (NULLABLE_NUMBER_FIELDS.has(field)) {
        const parsed = value === "" ? null : Number(value);
        if (parsed !== null && !Number.isFinite(parsed)) {
          throw new Error(`${String(field)} in row ${rowIndex + 2} is not a finite number`);
        }
        mutable[field] = parsed;
      } else if (field === "iteration") {
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed) || parsed < 1) {
          throw new Error(`iteration in row ${rowIndex + 2} must be a positive integer`);
        }
        mutable[field] = parsed;
      } else if (BOOLEAN_FIELDS.has(field)) {
        mutable[field] = parseBoolean(value, String(field));
      } else if (NULLABLE_BOOLEAN_FIELDS.has(field)) {
        mutable[field] = value === "" ? null : parseBoolean(value, String(field));
      } else if (field === "status") {
        if (value !== "success" && value !== "error") {
          throw new Error(`status in row ${rowIndex + 2} must be success or error`);
        }
        mutable[field] = value;
      } else {
        mutable[field] = value;
      }
    }
    return sample;
  });
}
