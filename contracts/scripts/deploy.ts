import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying on network: ${network.name}`);
  console.log("Deploying with account:", deployer.address);

  const ModelRegistry = await ethers.getContractFactory("ModelRegistry");
  const registry = await ModelRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("ModelRegistry deployed to:", address);

  const artifact = require("../artifacts/contracts/ModelRegistry.sol/ModelRegistry.json");
  const output = { address, abi: artifact.abi };

  const outputPath = path.resolve(__dirname, "../../lib/contracts/ModelRegistry.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("ABI + address written to lib/contracts/ModelRegistry.json");
  if (network.name === "sepolia") {
    console.log(`\nVerify on Etherscan: https://sepolia.etherscan.io/address/${address}`);
  }
  console.log("\nAdd to .env:");
  console.log(`BLOCKCHAIN_RPC_URL=${network.name === "sepolia" ? process.env.SEPOLIA_RPC_URL : "http://127.0.0.1:8545"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
