# Sepolia Gas and Confirmation-Latency Benchmark Design

Date: 2026-08-12

## Purpose

The experiment provides a small external-validity check for the existing local
Hardhat gas benchmark. It answers two narrowly defined questions:

1. Does the gas advantage observed for a batch of ten models remain visible
   when the same contract operations execute on Ethereum Sepolia?
2. What transaction-confirmation latency and effective fee were observed on
   Sepolia during this particular experiment?

The experiment does not replace the controlled Hardhat benchmark and does not
claim that its latency or fee results generalize to Ethereum mainnet, other RPC
providers, or other time periods.

## Selected Variant

The benchmark uses one representative batch size of ten models, one warm-up
round, and five recorded rounds. Two fresh `ModelRegistry` contracts isolate
the strategies:

- individual strategy: ten sequential `registerModel` transactions per round;
- Merkle strategy: one `registerMerkleRoot` transaction containing ten model
  identifiers per round.

The complete experiment sends 68 transactions:

- two contract deployments;
- 60 individual registrations, including ten warm-up transactions;
- six Merkle registrations, including one warm-up transaction.

The warm-up round remains in the raw record, including its cost, but is
excluded from descriptive statistics.

## Local Reference

The original thesis experiment remains represented by
`measurements/raw/gas-local-hardhat.csv`. That CSV is valid evidence for its
original fresh-contract-per-repetition design, but it is not used for a direct
cross-environment comparison with this Sepolia series because its storage
topology differs.

The coordinated comparison instead uses a new Sepolia-matched Hardhat JSON
reference. It replays the exact canonical 68-operation plan on two contracts
that remain deployed for the whole series: one contract for all individual
registrations and one for all Merkle registrations. It uses batch size ten,
one warm-up round, five recorded rounds, unique model identifiers, and the
same full 40-hex code-version identifier as the Sepolia artifact.

The matched artifact records Hardhat chain ID 31337, runtime and Solidity
compiler settings, the deployed runtime-bytecode Keccak-256, two public local
contract addresses, and the destination contract address and actually
submitted fixed gas limit for each of 68 successful receipts. It also records
12 round aggregates and Merkle `batchCount` transitions `0 -> 1` through
`5 -> 6`. The artifact is identified by `kind: "hardhat-sepolia-matched"`,
`status: "completed"`, and
`topology: "one-long-lived-contract-per-strategy"`. Its truthful compiler
metadata includes Solidity 0.8.19, optimizer disabled with 200 configured runs,
and EVM version `paris`. After atomically replacing the final JSON, the writer
hashes its exact bytes and atomically writes a sibling `<artifact>.sha256`
containing lowercase 64-hex plus a newline.

The runner requires `GAS_BENCHMARK_COMMIT`. An optional
`HARDHAT_MATCHED_BENCHMARK_OUTPUT` overrides the destination; otherwise the
runner creates an absolute path under
`measurements/raw/hardhat-sepolia-matched/`. Its final public JSON line prints
the exact `rawPath`, `checksumPath`, and `sha256` digest.

The existing local measurements are approximately:

- individual registration: 942,130 gas for ten models;
- Merkle registration: 587,661 gas for ten models;
- observed reduction: approximately 37.6% of total gas for the Merkle
  strategy.

Those approximate CSV values remain historical context only. The coordinated
analysis derives all local comparison values from the matched JSON, verifies
its sibling digest, requires identical code-version identifiers, validates the
long-lived storage topology and all arithmetic, and does not claim deployed
Sepolia bytecode identity from source equality.

## Execution Model

Each strategy receives a separate fresh contract. Transactions are submitted
sequentially from the dedicated Sepolia test wallet and awaited for one receipt
confirmation before the next transaction is sent.

Every round uses new, deterministic 24-character hexadecimal model identifiers
to match the identifiers used in the local benchmark and to avoid overwriting
existing storage slots. Merkle roots are deterministic for the series and
round, but are unique between rounds.

For every transaction, the runner records monotonic durations around these
boundaries:

- submission duration: immediately before the contract call until a
  transaction response with a hash is returned;
- confirmation duration: receipt wait beginning after the transaction hash is
  available;
- end-to-end duration: immediately before the contract call until the receipt
  is available.

For an individual round, the runner also records wall-clock duration from the
start of the first registration until receipt of the tenth registration. The
Merkle round duration is the end-to-end duration of its single transaction.
Durations use a monotonic clock; corresponding UTC timestamps provide audit
context.

## Recorded Data

The raw artifact contains:

- unique series identifier and UTC timestamps;
- status: `running`, `completed`, or `aborted` with a reason;
- Node.js, Hardhat, network and chain ID;
- public deployer and contract addresses;
- a code-version identifier retained only in raw research data;
- batch size, warm-up count and recorded repetition count;
- per-transaction strategy, round, sequence number and warm-up flag;
- transaction hash, nonce, broadcast-acknowledgement state, block number,
  receipt status and confirmation count;
- gas estimate, configured gas limit, `gasUsed`, effective gas price and
  actual fee in wei;
- submission, confirmation and end-to-end durations;
- per-round aggregate gas, fee and wall-clock duration;
- total experiment gas and fee;
- the user-approved maximum cost and remaining wallet balance checks.

The artifact must not contain the private key, RPC URL, environment-variable
values, cookies, or authenticated application data. An optional provider label
may be stored only as a non-secret name supplied separately from the URL.

## Output and Checkpointing

The canonical raw result is written to:

`measurements/raw/sepolia/sepolia-gas-latency-<timestamp>.json`

Before each provider broadcast, the runner locally signs the fully populated
transaction, derives its exact hash and nonce, and atomically checkpoints a
pending intent with its worst-case reserved cost. It then broadcasts those
exact signed bytes once. Provider acknowledgement and the later receipt are
checkpointed as separate state transitions. Thus a lost RPC response or a
checkpoint failure after provider acceptance still leaves the pre-broadcast
hash, nonce and reservation available for reconciliation, and never causes a
retry. If the experiment stops after some transactions have been sent, the
retained artifact has status `aborted`, lists the completed and pending
operations, and reports the actual partial cost. A rerun creates a new series
instead of appending to or overwriting the previous one.

A separate analysis step writes a derived summary under
`measurements/processed/`. The raw artifact is never modified by analysis.
Its three explicit CLI arguments are the Sepolia JSON, matched Hardhat JSON,
and output summary. The sibling checksum is discovered as
`<matched-hardhat.json>.sha256`; all four filesystem endpoints must be distinct
after resolved-path, symbolic-link, and hard-link checks.

## Descriptive Analysis

For five recorded rounds, in original round order, the report includes:

- all observed values;
- median and min-max range;
- total gas and gas per model;
- actual fee in wei and Sepolia ETH;
- individual-round and Merkle-round confirmation durations;
- relative difference between the two strategies;
- difference between Sepolia gas use and the local Hardhat reference.

Gas and fee observations use exact decimal strings. Fee values are also
rendered as deterministic decimal ETH strings. The processed summary includes
the local series ID and artifact SHA-256, but excludes both code-version hashes
(`source` and `localSource` are not output).

The report does not calculate p95 or perform inferential hypothesis tests for
five observations. Fee conversion to PLN or another currency is excluded
unless a dated exchange-rate source and explicit assumptions are added later.

## Safety and Spend Control

The workflow is divided into a no-transaction preflight and a separately
confirmed execution.

The preflight:

1. verifies Sepolia and chain ID 11155111;
2. verifies the dedicated wallet, contract artifact and RPC connectivity;
3. estimates both deployments and representative strategy transactions; the
   interaction estimates use the existing smoke-test contract only after its
   runtime bytecode and owner match the current artifact and test wallet;
4. checks each estimate against an explicit per-transaction gas ceiling;
5. calculates a conservative whole-experiment cost bound using all 68
   transaction ceilings and current fee data;
6. checks the wallet balance;
7. prints the bound without sending a transaction or exposing secrets.

After the user approves a specific maximum amount in wei, execution requires
that amount as an explicit configuration value. Before every transaction, the
runner obtains current fee data and verifies that:

- the gas estimate remains below its transaction ceiling;
- cumulative actual spending plus the next transaction's worst-case cost does
  not exceed the approved whole-experiment maximum;
- the wallet balance covers the next worst-case cost.

Any failed check stops before the next transaction. Before broadcast, a
connected local wallet populates and signs the transaction, then the exact
hash, nonce and worst-case reservation are persisted. The provider receives
the exact signed bytes once; the runner neither retries nor replaces them. A
receipt with a status other than one, an RPC failure, a checkpoint failure, or
an unexpected chain ID aborts the series and preserves the latest durable
partial artifact. Receipt waiting has a ten-minute timeout. A timeout retains
the already-broadcast transaction as pending, stops before any later
transaction, and keeps that transaction's worst-case cost within the approved
budget because it may still be mined. The runner never silently raises a gas
or total-cost ceiling.

The implementation uses these per-transaction ceilings:

- deployment: 1,500,000 gas per contract;
- individual registration: 150,000 gas per model;
- Merkle registration for ten models: 750,000 gas per batch.

These ceilings produce a maximum aggregate allowance of 16,500,000 gas. The
actual approved Sepolia-ETH amount is calculated from fresh fee data and must
be confirmed separately before execution. If preflight estimation exceeds a
ceiling, execution remains blocked until the design and tests are deliberately
revised; preflight does not modify a ceiling.

## Verification and Tests

Implementation follows test-driven development. Automated tests cover:

- exact operation count of 68 and separation of warm-up from recorded rounds;
- unique 24-character identifiers;
- aggregation of ten individual transactions into one round;
- duration, gas and fee calculations from literal fixtures;
- rejection of the wrong chain, missing configuration and invalid ceilings;
- enforcement of the approved cumulative cost before each send;
- secret-free serialization;
- atomic checkpoint and completed/aborted result behavior;
- analysis of five observations using median and min-max without p95.

Before execution, the existing verifier and contract suites must still pass on
Node.js 24. After execution, the raw artifact is validated against its schema,
receipt statuses and arithmetic totals before any thesis documentation is
changed.

## Thesis Interpretation

The Sepolia result is reported as an external-validity observation, separate
from the main Hardhat benchmark. Gas-unit agreement can strengthen the claim
that the measured contract-level difference is not an artifact of the local
node. Confirmation time, effective gas price and fee are reported only as
conditions observed during the dated series.

No Sepolia value is inserted into the existing Hardhat tables. Any thesis
change is limited to a separate short subsection, table, or limitation note
after the result is complete and reproducible. Commit hashes remain confined
to raw research metadata and are not placed in thesis prose, tables, captions,
or bibliography entries.

## Completion Criteria

The experiment is complete only when:

- preflight succeeds and the user explicitly approves its maximum cost;
- both fresh contracts are deployed and all 68 receipts have status one;
- the five recorded rounds contain complete gas, fee and timing data;
- raw totals independently reconcile with receipt data; the wallet balance
  delta is an additional cross-check when no other wallet activity occurred;
- the processed summary reproduces the local comparison from raw inputs;
- tests pass and working thesis records are updated without mixing networks;
- limitations explicitly state the single batch size, five observations,
  specific RPC path and time-dependent public-network conditions.
