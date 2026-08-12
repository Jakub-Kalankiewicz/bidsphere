import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "chai";
import { ethers } from "hardhat";

import { runSepoliaMatchedBenchmark } from "../scripts/benchmark-gas-sepolia-matched";

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
    expect(result.artifactKind).to.equal("bidsphere-sepolia-matched-hardhat");
    expect(result.network).to.equal("hardhat");
    expect(result.chainId).to.equal(31337);
    expect(result.storageTopology).to.equal("one-long-lived-contract-per-strategy");
    expect(result.codeVersion).to.equal(codeVersion);
    expect(result.transactions).to.have.length(68);
    expect(result.transactions.every((record) => record.receiptStatus === 1)).to.equal(true);
    expect(new Set(result.transactions.map((record) => record.operationId)).size).to.equal(68);
    expect(new Set(result.transactions.map((record) => record.transactionHash)).size).to.equal(68);
    expect(result.rounds).to.have.length(12);
    expect(result.contractAddresses.individual).not.to.equal(result.contractAddresses.merkle);
    expect(result.deployedBytecodeKeccak256).to.match(/^0x[0-9a-f]{64}$/);
    expect(checksum).to.match(/^[0-9a-f]{64}\n$/);
    expect(ethers.sha256(rawBytes)).to.equal(`0x${checksum.trim()}`);

    const merkle = result.transactions.filter(
      (record) => record.kind === "merkle-registration"
    );
    expect(merkle.map((record) => [record.merkleBatchCountBefore, record.merkleBatchCountAfter]))
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
