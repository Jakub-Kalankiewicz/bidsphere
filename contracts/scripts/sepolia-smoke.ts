import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import type { Contract, ContractTransactionReceipt } from "ethers";

import { verifyProofBundle } from "../../public/verify-core.mjs";

import {
  assertSepoliaPreflightInputs,
  assertGasEstimateWithinLimit,
  buildSepoliaFixture,
  estimateSmokeMinimumBalance,
  SEPOLIA_SMOKE_GAS_LIMITS,
} from "./sepolia-smoke-helpers";

function receiptMetadata(receipt: ContractTransactionReceipt | null) {
  return {
    transactionHash: receipt?.hash ?? null,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status ?? null,
    gasUsed: receipt?.gasUsed?.toString() ?? null,
    effectiveGasPriceWei: receipt?.gasPrice?.toString() ?? null,
  };
}

async function main() {
  const runtimeNetwork = await ethers.provider.getNetwork();
  assertSepoliaPreflightInputs(
    network.name,
    runtimeNetwork.chainId,
    process.env
  );

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No Sepolia deployer is configured");

  const feeData = await ethers.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!maxFeePerGas) throw new Error("RPC did not return a usable fee estimate");
  const balance = await ethers.provider.getBalance(deployer.address);
  const minimumBalance = estimateSmokeMinimumBalance(maxFeePerGas);
  if (balance < minimumBalance) {
    throw new Error("Insufficient Sepolia test ETH for the bounded smoke test");
  }

  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  const transactionOverrides = (gasLimit: bigint) => ({
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  let registry: Contract;
  let deploymentReceipt: ContractTransactionReceipt | null = null;
  const configuredAddress = process.env.SEPOLIA_CONTRACT_ADDRESS?.trim();

  if (configuredAddress) {
    const address = ethers.getAddress(configuredAddress);
    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error("SEPOLIA_CONTRACT_ADDRESS has no contract code");
    registry = await ethers.getContractAt("ModelRegistry", address, deployer);
    const owner = await registry.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error("Configured Sepolia contract is not owned by the test deployer");
    }
  } else {
    const factory = await ethers.getContractFactory("ModelRegistry", deployer);
    const deploymentRequest = await factory.getDeployTransaction();
    const deploymentEstimate = await ethers.provider.estimateGas({
      ...deploymentRequest,
      from: deployer.address,
    });
    assertGasEstimateWithinLimit(
      deploymentEstimate,
      SEPOLIA_SMOKE_GAS_LIMITS.deployment,
      "contract deployment"
    );
    registry = (await factory.deploy(
      transactionOverrides(SEPOLIA_SMOKE_GAS_LIMITS.deployment)
    )) as unknown as Contract;
    const deploymentTransaction = registry.deploymentTransaction();
    if (!deploymentTransaction) throw new Error("Deployment transaction is unavailable");
    deploymentReceipt = await deploymentTransaction.wait();
    if (deploymentReceipt?.status !== 1) throw new Error("Contract deployment failed");
  }

  const contractAddress = await registry.getAddress();
  const fixture = buildSepoliaFixture();

  const modelEstimate = await registry.registerModel.estimateGas(
    fixture.modelId,
    fixture.fileHash
  );
  assertGasEstimateWithinLimit(
    modelEstimate,
    SEPOLIA_SMOKE_GAS_LIMITS.modelRegistration,
    "model registration"
  );
  const modelTransaction = await registry.registerModel(
    fixture.modelId,
    fixture.fileHash,
    transactionOverrides(SEPOLIA_SMOKE_GAS_LIMITS.modelRegistration)
  );
  const modelReceipt = await modelTransaction.wait();
  if (modelReceipt?.status !== 1) throw new Error("Model registration failed");

  const merkleEstimate = await registry.registerMerkleRoot.estimateGas(
    fixture.merkleRoot,
    [fixture.modelId, fixture.decoyModelId]
  );
  assertGasEstimateWithinLimit(
    merkleEstimate,
    SEPOLIA_SMOKE_GAS_LIMITS.merkleRegistration,
    "Merkle-root registration"
  );
  const batchTransaction = await registry.registerMerkleRoot(
    fixture.merkleRoot,
    [fixture.modelId, fixture.decoyModelId],
    transactionOverrides(SEPOLIA_SMOKE_GAS_LIMITS.merkleRegistration)
  );
  const batchReceipt = await batchTransaction.wait();
  if (batchReceipt?.status !== 1) throw new Error("Merkle registration failed");

  const batchId = Number(await registry.batchCount());
  const [storedHash] = await registry.getModel(fixture.modelId);
  const [storedRoot, registeredAt, storedModelIds] =
    await registry.getMerkleRoot(batchId);

  if (storedHash.toLowerCase() !== fixture.fileHash.toLowerCase()) {
    throw new Error("Sepolia model read-back does not match the registered hash");
  }
  if (storedRoot.toLowerCase() !== fixture.merkleRoot.toLowerCase()) {
    throw new Error("Sepolia Merkle read-back does not match the registered root");
  }

  const proofBundle = {
    modelId: fixture.modelId,
    modelName: "BidSphere Sepolia smoke GLB v1",
    fileHash: fixture.fileHash,
    batchId,
    merkleRoot: fixture.merkleRoot,
    merkleProof: fixture.merkleProof,
    leafIndex: fixture.leafIndex,
    totalLeaves: fixture.totalLeaves,
    registeredAt: Number(registeredAt),
    chainId: Number(runtimeNetwork.chainId),
    contractAddress: contractAddress.toLowerCase(),
  };

  const trustedRoots = { [batchId]: storedRoot };
  const verifierConfig = {
    chainId: Number(runtimeNetwork.chainId),
    contractAddress: contractAddress.toLowerCase(),
  };
  const positiveVerification = (
    await verifyProofBundle(
      fixture.bytes,
      proofBundle,
      trustedRoots,
      verifierConfig
    )
  ).accepted;
  const modifiedBytes = Buffer.from(fixture.bytes);
  modifiedBytes[modifiedBytes.length - 1] ^= 1;
  const tamperRejected = !(
    await verifyProofBundle(
      modifiedBytes,
      proofBundle,
      trustedRoots,
      verifierConfig
    )
  ).accepted;
  if (!positiveVerification || !tamperRejected) {
    throw new Error("Offline verification assertions failed");
  }

  const timestampUtc = new Date().toISOString();
  const seriesId = `sepolia-smoke-${timestampUtc.replace(/[:.]/g, "-")}`;
  const hardhatVersion = require("hardhat/package.json").version;
  const result = {
    series_id: seriesId,
    timestamp_utc: timestampUtc,
    network: network.name,
    chainId: Number(runtimeNetwork.chainId),
    deployerAddress: deployer.address,
    contractAddress,
    reusedDeployment: Boolean(configuredAddress),
    receipts: {
      deployment: receiptMetadata(deploymentReceipt),
      modelRegistration: receiptMetadata(modelReceipt),
      merkleRegistration: receiptMetadata(batchReceipt),
    },
    feeEstimate: {
      maxFeePerGasWei: maxFeePerGas.toString(),
      maxPriorityFeePerGasWei: maxPriorityFeePerGas.toString(),
      balanceBeforeWei: balance.toString(),
      boundedMinimumBalanceWei: minimumBalance.toString(),
      gasLimits: Object.fromEntries(
        Object.entries(SEPOLIA_SMOKE_GAS_LIMITS).map(([key, value]) => [
          key,
          value.toString(),
        ])
      ),
    },
    modelHash: fixture.fileHash,
    merkleRoot: fixture.merkleRoot,
    batchId,
    storedModelIds: [...storedModelIds],
    proofSizeBytes: Buffer.byteLength(JSON.stringify(proofBundle), "utf8"),
    proofBundle,
    verification: {
      originalAccepted: positiveVerification,
      oneByteModificationRejected: tamperRejected,
    },
    runtime: {
      node: process.version,
      hardhat: hardhatVersion,
    },
  };

  const outputDirectory = path.resolve(
    __dirname,
    "../../measurements/raw/sepolia"
  );
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${seriesId}.json`);
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(result, null, 2));
  fs.renameSync(temporaryPath, outputPath);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        series_id: seriesId,
        chainId: Number(runtimeNetwork.chainId),
        deployerAddress: deployer.address,
        contractAddress,
        outputPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
