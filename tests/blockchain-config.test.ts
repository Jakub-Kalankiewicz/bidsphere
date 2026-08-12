import assert from "node:assert/strict";
import test from "node:test";

import {
  getBlockchainExperimentConfig,
  resolveContractAddress,
} from "../lib/blockchain-config.ts";

const LOCAL_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const SEPOLIA_ADDRESS = "0x1111111111111111111111111111111111111111";

test("accepts explicit local Hardhat experiment configuration", () => {
  assert.deepEqual(
    getBlockchainExperimentConfig({
      BLOCKCHAIN_CHAIN_ID: "31337",
      BLOCKCHAIN_CONTRACT_ADDRESS: LOCAL_ADDRESS,
    }),
    {
      chainId: 31_337,
      contractAddress: LOCAL_ADDRESS.toLowerCase(),
    }
  );
});

test("accepts explicit Sepolia experiment configuration", () => {
  assert.deepEqual(
    getBlockchainExperimentConfig({
      BLOCKCHAIN_CHAIN_ID: "11155111",
      BLOCKCHAIN_CONTRACT_ADDRESS: SEPOLIA_ADDRESS,
    }),
    {
      chainId: 11_155_111,
      contractAddress: SEPOLIA_ADDRESS,
    }
  );
});

test("rejects a missing chain ID", () => {
  assert.throws(
    () =>
      getBlockchainExperimentConfig({
        BLOCKCHAIN_CONTRACT_ADDRESS: LOCAL_ADDRESS,
      }),
    /BLOCKCHAIN_CHAIN_ID is required/
  );
});

test("rejects a non-integer chain ID", () => {
  assert.throws(
    () =>
      getBlockchainExperimentConfig({
        BLOCKCHAIN_CHAIN_ID: "31337.5",
        BLOCKCHAIN_CONTRACT_ADDRESS: LOCAL_ADDRESS,
      }),
    /BLOCKCHAIN_CHAIN_ID must be a positive integer/
  );
});

test("rejects a non-positive chain ID", () => {
  assert.throws(
    () =>
      getBlockchainExperimentConfig({
        BLOCKCHAIN_CHAIN_ID: "0",
        BLOCKCHAIN_CONTRACT_ADDRESS: LOCAL_ADDRESS,
      }),
    /BLOCKCHAIN_CHAIN_ID must be a positive integer/
  );
});

test("rejects a malformed contract address", () => {
  assert.throws(
    () =>
      getBlockchainExperimentConfig({
        BLOCKCHAIN_CHAIN_ID: "31337",
        BLOCKCHAIN_CONTRACT_ADDRESS: "0x1234",
      }),
    /BLOCKCHAIN_CONTRACT_ADDRESS must be a 0x-prefixed 20-byte address/
  );
});

test("uses the explicit contract address before a deployment fallback", () => {
  assert.equal(
    resolveContractAddress(
      { BLOCKCHAIN_CONTRACT_ADDRESS: SEPOLIA_ADDRESS },
      LOCAL_ADDRESS,
      11_155_111
    ),
    SEPOLIA_ADDRESS
  );
});

test("uses a validated deployment fallback only on local Hardhat", () => {
  assert.equal(
    resolveContractAddress({}, LOCAL_ADDRESS, 31_337),
    LOCAL_ADDRESS.toLowerCase()
  );
  assert.throws(
    () => resolveContractAddress({}, LOCAL_ADDRESS, 11_155_111),
    /BLOCKCHAIN_CONTRACT_ADDRESS is required outside local Hardhat/
  );
});

test("rejects a missing or zero explicit contract address", () => {
  assert.throws(
    () =>
      getBlockchainExperimentConfig({
        BLOCKCHAIN_CHAIN_ID: "31337",
      }),
    /BLOCKCHAIN_CONTRACT_ADDRESS is required/
  );
  assert.throws(
    () =>
      getBlockchainExperimentConfig({
        BLOCKCHAIN_CHAIN_ID: "31337",
        BLOCKCHAIN_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
      }),
    /cannot be the zero address/
  );
});
