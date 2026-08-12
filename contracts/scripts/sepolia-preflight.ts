import { ethers, network } from "hardhat";

import {
  assertSepoliaPreflightInputs,
  estimateSmokeMinimumBalance,
} from "./sepolia-smoke-helpers";

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
    throw new Error(
      `Insufficient Sepolia test ETH: balance ${ethers.formatEther(balance)} ETH, ` +
        `bounded requirement ${ethers.formatEther(minimumBalance)} ETH`
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        transactionSent: false,
        network: network.name,
        chainId: Number(runtimeNetwork.chainId),
        deployerAddress: deployer.address,
        balanceWei: balance.toString(),
        maxFeePerGasWei: maxFeePerGas.toString(),
        boundedMinimumBalanceWei: minimumBalance.toString(),
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
