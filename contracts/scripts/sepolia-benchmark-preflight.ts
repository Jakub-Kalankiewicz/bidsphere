import { artifacts, ethers, network } from "hardhat";
import type { Contract } from "ethers";

import {
  SEPOLIA_BENCHMARK_CONFIG,
  SEPOLIA_BENCHMARK_GAS_LIMITS,
  buildBenchmarkOperationPlan,
  buildBenchmarkPreflightReport,
  calculateAggregateGasCeiling,
  createBenchmarkMerkleRoot,
  createBenchmarkModelId,
} from "./sepolia-benchmark-helpers";
import {
  assertGasEstimateWithinLimit,
  assertSepoliaPreflightInputs,
} from "./sepolia-smoke-helpers";

const PREFLIGHT_SERIES_ID = "sepolia-benchmark-preflight";

function referenceContractAddressFromEnvironment(): string {
  const configuredAddress = process.env.SEPOLIA_BENCHMARK_REFERENCE_CONTRACT_ADDRESS?.trim();
  if (!configuredAddress) {
    throw new Error("SEPOLIA_BENCHMARK_REFERENCE_CONTRACT_ADDRESS is required");
  }
  return ethers.getAddress(configuredAddress);
}

async function main() {
  const runtimeNetwork = await ethers.provider.getNetwork();
  assertSepoliaPreflightInputs(network.name, runtimeNetwork.chainId, process.env);

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No Sepolia deployer is configured");

  const referenceContractAddress = referenceContractAddressFromEnvironment();
  const feeData = await ethers.provider.getFeeData();
  const maxFeePerGasWei = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!maxFeePerGasWei) throw new Error("RPC did not return a usable fee estimate");
  const maxPriorityFeePerGasWei = feeData.maxPriorityFeePerGas ?? 0n;
  const balanceWei = await ethers.provider.getBalance(deployer.address);

  const onChainCode = await ethers.provider.getCode(referenceContractAddress);
  const artifact = await artifacts.readArtifact("ModelRegistry");
  const bytecodeMatches =
    ethers.keccak256(onChainCode) === ethers.keccak256(artifact.deployedBytecode);

  const registry = (await ethers.getContractAt(
    "ModelRegistry",
    referenceContractAddress,
    deployer
  )) as unknown as Contract;
  const owner = await registry.owner();
  const ownerMatches = ethers.getAddress(owner) === ethers.getAddress(deployer.address);

  const factory = await ethers.getContractFactory("ModelRegistry", deployer);
  const deploymentRequest = await factory.getDeployTransaction();
  const deployment = await ethers.provider.estimateGas({
    ...deploymentRequest,
    from: deployer.address,
  });
  assertGasEstimateWithinLimit(
    deployment,
    SEPOLIA_BENCHMARK_GAS_LIMITS.deployment,
    "ModelRegistry deployment"
  );

  const individualModelId = createBenchmarkModelId(
    PREFLIGHT_SERIES_ID,
    "individual",
    0,
    0
  );
  const individualRegistration = await registry.registerModel.estimateGas(
    individualModelId,
    ethers.keccak256(ethers.toUtf8Bytes(individualModelId))
  );
  assertGasEstimateWithinLimit(
    individualRegistration,
    SEPOLIA_BENCHMARK_GAS_LIMITS.individualRegistration,
    "Individual model registration"
  );

  const merkleModelIds = Array.from(
    { length: SEPOLIA_BENCHMARK_CONFIG.batchSize },
    (_, index) => createBenchmarkModelId(PREFLIGHT_SERIES_ID, "merkle", 0, index)
  );
  const merkleRegistration = await registry.registerMerkleRoot.estimateGas(
    createBenchmarkMerkleRoot(PREFLIGHT_SERIES_ID, 0),
    merkleModelIds
  );
  assertGasEstimateWithinLimit(
    merkleRegistration,
    SEPOLIA_BENCHMARK_GAS_LIMITS.merkleRegistration,
    "Merkle-root registration"
  );

  const operationPlan = buildBenchmarkOperationPlan(PREFLIGHT_SERIES_ID);
  const report = buildBenchmarkPreflightReport({
    chainId: runtimeNetwork.chainId,
    deployerAddress: deployer.address,
    referenceContractAddress,
    bytecodeMatches,
    ownerMatches,
    operationPlan,
    aggregateGasCeiling: calculateAggregateGasCeiling(operationPlan),
    maxFeePerGasWei,
    maxPriorityFeePerGasWei,
    balanceWei,
    estimates: { deployment, individualRegistration, merkleRegistration },
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
