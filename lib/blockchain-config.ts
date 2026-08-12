const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

type BlockchainEnvironment = Record<string, string | undefined>;

export interface BlockchainExperimentConfig {
  chainId: number;
  contractAddress: string;
}

function normalizeContractAddress(value: string, label: string): string {
  const address = value.trim();
  if (!ADDRESS_PATTERN.test(address)) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address`);
  }
  const normalized = address.toLowerCase();
  if (normalized === ZERO_ADDRESS) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return normalized;
}

export function getBlockchainExperimentConfig(
  environment: BlockchainEnvironment = process.env
): BlockchainExperimentConfig {
  const chainIdValue = environment.BLOCKCHAIN_CHAIN_ID?.trim();
  if (!chainIdValue) {
    throw new Error("BLOCKCHAIN_CHAIN_ID is required");
  }
  if (!POSITIVE_INTEGER_PATTERN.test(chainIdValue)) {
    throw new Error("BLOCKCHAIN_CHAIN_ID must be a positive integer");
  }

  const chainId = Number(chainIdValue);
  if (!Number.isSafeInteger(chainId)) {
    throw new Error("BLOCKCHAIN_CHAIN_ID must be a positive integer");
  }

  const contractAddressValue = environment.BLOCKCHAIN_CONTRACT_ADDRESS?.trim();
  if (!contractAddressValue) {
    throw new Error("BLOCKCHAIN_CONTRACT_ADDRESS is required");
  }

  return {
    chainId,
    contractAddress: normalizeContractAddress(
      contractAddressValue,
      "BLOCKCHAIN_CONTRACT_ADDRESS"
    ),
  };
}

export function resolveContractAddress(
  environment: BlockchainEnvironment,
  deploymentFallback: string,
  runtimeChainId: number
): string {
  const configuredAddress = environment.BLOCKCHAIN_CONTRACT_ADDRESS?.trim();
  if (!configuredAddress && runtimeChainId !== 31_337) {
    throw new Error(
      "BLOCKCHAIN_CONTRACT_ADDRESS is required outside local Hardhat"
    );
  }
  return normalizeContractAddress(
    configuredAddress || deploymentFallback,
    configuredAddress ? "BLOCKCHAIN_CONTRACT_ADDRESS" : "deployment contract address"
  );
}
