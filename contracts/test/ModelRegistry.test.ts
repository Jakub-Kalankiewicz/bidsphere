import { expect } from "chai";
import { ethers } from "hardhat";
import { ModelRegistry } from "../typechain-types";

describe("ModelRegistry", () => {
  let registry: ModelRegistry;
  let owner: any;
  let other: any;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ModelRegistry");
    registry = await Factory.deploy();
  });

  // Individual registration (regression)
  it("registers and retrieves a model hash", async () => {
    const id = "model1";
    const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
    await registry.registerModel(id, hash);
    const [h] = await registry.getModel(id);
    expect(h).to.equal(hash);
  });

  it("reverts getModel for unregistered model", async () => {
    await expect(registry.getModel("missing")).to.be.revertedWith("Model not registered");
  });

  it("rejects registerModel from non-owner", async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("x"));
    await expect(registry.connect(other).registerModel("id", hash)).to.be.revertedWith("Not authorized");
  });

  // Merkle batch
  it("registers a Merkle batch and retrieves root", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    await registry.registerMerkleRoot(root, ["m1", "m2"]);
    const [r, , ids] = await registry.getMerkleRoot(1);
    expect(r).to.equal(root);
    expect(ids).to.deep.equal(["m1", "m2"]);
  });

  it("maps each modelId to its batchId via O(1) lookup", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    await registry.registerMerkleRoot(root, ["m1", "m2"]);
    expect(await registry.getBatchForModel("m1")).to.equal(1);
    expect(await registry.getBatchForModel("m2")).to.equal(1);
    expect(await registry.getBatchForModel("unknown")).to.equal(0);
  });

  it("overwrites batchId when model is re-batched", async () => {
    const r1 = ethers.keccak256(ethers.toUtf8Bytes("root1"));
    const r2 = ethers.keccak256(ethers.toUtf8Bytes("root2"));
    await registry.registerMerkleRoot(r1, ["m1"]);
    await registry.registerMerkleRoot(r2, ["m1"]);
    expect(await registry.getBatchForModel("m1")).to.equal(2);
  });

  it("rejects registerMerkleRoot from non-owner", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    await expect(
      registry.connect(other).registerMerkleRoot(root, ["m1"])
    ).to.be.revertedWith("Not authorized");
  });

  it("reverts getMerkleRoot for invalid batchId", async () => {
    await expect(registry.getMerkleRoot(0)).to.be.revertedWith("Batch not found");
    await expect(registry.getMerkleRoot(99)).to.be.revertedWith("Batch not found");
  });

  it("increments batchCount on each registration", async () => {
    const root = ethers.keccak256(ethers.toUtf8Bytes("r"));
    await registry.registerMerkleRoot(root, ["a"]);
    await registry.registerMerkleRoot(root, ["b"]);
    expect(await registry.batchCount()).to.equal(2);
  });
});
