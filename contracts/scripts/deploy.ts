import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import { getDeploymentOutputPath } from "./deployment-output";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying on network: ${network.name}`);
  console.log("Deploying with account:", deployer.address);

  const ModelRegistry = await ethers.getContractFactory("ModelRegistry");
  const registry = await ModelRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const deploymentTransaction = registry.deploymentTransaction();
  const runtimeNetwork = await ethers.provider.getNetwork();
  console.log("ModelRegistry deployed to:", address);

  const artifact = require("../artifacts/contracts/ModelRegistry.sol/ModelRegistry.json");
  const output =
    network.name === "sepolia"
      ? {
          address,
          abi: artifact.abi,
          network: network.name,
          chainId: Number(runtimeNetwork.chainId),
          deploymentTransactionHash: deploymentTransaction?.hash ?? null,
        }
      : { address, abi: artifact.abi };

  const repositoryRoot = path.resolve(__dirname, "../..");
  const outputPath = getDeploymentOutputPath(network.name, repositoryRoot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("Deployment record written to:", outputPath);
  if (network.name === "sepolia") {
    console.log(`\nVerify on Etherscan: https://sepolia.etherscan.io/address/${address}`);
  }
  console.log("\nConfigure the application with the runtime network and contract address.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
