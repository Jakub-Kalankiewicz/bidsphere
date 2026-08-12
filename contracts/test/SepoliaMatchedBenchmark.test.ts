import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "chai";
import { ethers } from "hardhat";

import * as matchedBenchmark from "../scripts/benchmark-gas-sepolia-matched";

const { runSepoliaMatchedBenchmark } = matchedBenchmark;

describe("Sepolia-matched Hardhat benchmark", () => {
  it("replays the 68-operation long-lived storage topology and writes verifiable evidence", async () => {
    const outputPath = join(
      process.env.TMPDIR ?? "/tmp",
      `bidsphere-matched-${Date.now()}.json`
    );
    const codeVersion = "0123456789abcdef0123456789abcdef01234567";

    const result = await runSepoliaMatchedBenchmark(outputPath, codeVersion);
    const rawBytes = await readFile(outputPath);
    const checksum = await readFile(`${outputPath}.sha256`, "utf8");

    expect(result.schemaVersion).to.equal(1);
    expect(result.kind).to.equal("hardhat-sepolia-matched");
    expect(result.status).to.equal("completed");
    expect(result.network).to.equal("hardhat");
    expect(result.chainId).to.equal(31337);
    expect(result.topology).to.equal("one-long-lived-contract-per-strategy");
    expect(result.codeVersion).to.equal(codeVersion);
    expect(result.runtime.solidityCompiler).to.deep.equal({
      version: "0.8.19",
      optimizerEnabled: false,
      optimizerRuns: 200,
      evmVersion: "paris",
    });
    expect(result.transactions).to.have.length(68);
    expect(result.transactions.every((record) => record.receiptStatus === 1)).to.equal(true);
    expect(new Set(result.transactions.map((record) => record.operationId)).size).to.equal(68);
    expect(new Set(result.transactions.map((record) => record.transactionHash)).size).to.equal(68);
    expect(result.rounds).to.have.length(12);
    expect(result.contractAddresses.individual).not.to.equal(result.contractAddresses.merkle);
    expect(result.deployedBytecodeKeccak256).to.match(/^0x[0-9a-f]{64}$/);
    expect(checksum).to.match(/^[0-9a-f]{64}\n$/);
    expect(ethers.sha256(rawBytes)).to.equal(`0x${checksum.trim()}`);

    for (const [index, transaction] of result.transactions.entries()) {
      const expectedAddress = result.contractAddresses[transaction.strategy];
      expect(transaction.contractAddress).to.equal(expectedAddress);
      expect(transaction.gasLimit).to.equal(result.plannedOperations[index].gasLimit);
      const submitted = await ethers.provider.getTransaction(transaction.transactionHash);
      expect(submitted?.gasLimit.toString()).to.equal(transaction.gasLimit);
      if (transaction.kind !== "merkle-registration") {
        expect(transaction.batchCountBefore).to.equal(null);
        expect(transaction.batchCountAfter).to.equal(null);
      }
      expect(transaction).not.to.have.property("merkleBatchCountBefore");
      expect(transaction).not.to.have.property("merkleBatchCountAfter");
    }

    const merkle = result.transactions.filter(
      (record) => record.kind === "merkle-registration"
    );
    expect(merkle.map((record) => [record.batchCountBefore, record.batchCountAfter]))
      .to.deep.equal([
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
      ]);
    expect(result.finalMerkleBatchCount).to.equal(6);
  });

  it("uses the required commit variable, computes the default path, and prints all evidence coordinates", () => {
    const helpers = matchedBenchmark as unknown as {
      defaultMatchedBenchmarkOutputPath: (seriesId: string) => string;
    };
    const defaultPath = helpers.defaultMatchedBenchmarkOutputPath("series-fixed");
    expect(defaultPath).to.equal(
      join(
        __dirname,
        "..",
        "..",
        "measurements",
        "raw",
        "hardhat-sepolia-matched",
        "hardhat-sepolia-matched-series-fixed.json"
      )
    );

    const outputPath = join(
      process.env.TMPDIR ?? "/tmp",
      `bidsphere-matched-cli-${Date.now()}.json`
    );
    const env = {
      ...process.env,
      GAS_BENCHMARK_COMMIT: "0123456789abcdef0123456789abcdef01234567",
      HARDHAT_MATCHED_BENCHMARK_OUTPUT: outputPath,
    };
    delete env.HARDHAT_MATCHED_BENCHMARK_CODE_VERSION;
    const executed = spawnSync(
      process.execPath,
      [
        join(__dirname, "..", "node_modules", "hardhat", "internal", "cli", "cli.js"),
        "run",
        "--no-compile",
        "scripts/benchmark-gas-sepolia-matched.ts",
        "--network",
        "hardhat",
      ],
      { cwd: join(__dirname, ".."), env, encoding: "utf8" }
    );
    expect(executed.status).to.equal(0, executed.stderr);
    const publicLines = executed.stdout.trim().split("\n");
    const coordinates = JSON.parse(publicLines.at(-1)!);
    expect(coordinates.rawPath).to.equal(outputPath);
    expect(coordinates.checksumPath).to.equal(`${outputPath}.sha256`);
    expect(coordinates.sha256).to.match(/^[0-9a-f]{64}$/);
  });

  it("isolates the exact 17100-gas first-write effect for the Merkle batch counter", async () => {
    const factory = await ethers.getContractFactory("ModelRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();
    const firstIds = Array.from({ length: 10 }, (_, index) =>
      `${index.toString(16).padStart(2, "0")}${"a".repeat(22)}`
    );
    const laterIds = Array.from({ length: 10 }, (_, index) =>
      `${index.toString(16).padStart(2, "0")}${"b".repeat(22)}`
    );

    const first = await (
      await registry.registerMerkleRoot(`0x${"11".repeat(32)}`, firstIds)
    ).wait();
    const later = await (
      await registry.registerMerkleRoot(`0x${"22".repeat(32)}`, laterIds)
    ).wait();

    expect(first?.status).to.equal(1);
    expect(later?.status).to.equal(1);
    expect(first!.gasUsed - later!.gasUsed).to.equal(17_100n);
  });

  it("does not introduce a first-write counter effect for individual registrations", async () => {
    const factory = await ethers.getContractFactory("ModelRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();
    const hash = `0x${"ab".repeat(32)}`;

    const first = await (await registry.registerModel("aaaaaaaaaaaaaaaaaaaaaaaa", hash)).wait();
    const later = await (await registry.registerModel("bbbbbbbbbbbbbbbbbbbbbbbb", hash)).wait();

    expect(first?.status).to.equal(1);
    expect(later?.status).to.equal(1);
    expect(first?.gasUsed).to.equal(later?.gasUsed);
  });
});
