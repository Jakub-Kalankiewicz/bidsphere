import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const ModelRegistry = await ethers.getContractFactory("ModelRegistry");
  const registry = await ModelRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("ModelRegistry deployed to:", address);

  // Write ABI + address for the Next.js app
  const artifact = require("../artifacts/contracts/ModelRegistry.sol/ModelRegistry.json");
  const output = {
    address,
    abi: artifact.abi,
  };

  const outputPath = path.resolve(__dirname, "../../lib/contracts/ModelRegistry.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("ABI + address written to lib/contracts/ModelRegistry.json");
  console.log("\nAdd these to your .env:");
  console.log(`BLOCKCHAIN_CONTRACT_ADDRESS=${address}`);
  console.log(`BLOCKCHAIN_PRIVATE_KEY=${(deployer as any).privateKey ?? "<copy from hardhat node output>"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
