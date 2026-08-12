import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ethers } from "ethers";

import { resolveContractAddress } from "../lib/blockchain-config.ts";
import {
  assertLocalFixtureNetwork,
  createOfflineFixtureArtifacts,
  writeOfflineFixtureArtifacts,
} from "../lib/offline-fixture.mjs";

const LOCAL_RPC_URL = "http://127.0.0.1:18545";
const LOCAL_CHAIN_ID = 31_337;
const FIXTURE_REGISTRATION_TIMESTAMP = 1_786_579_202;
const artifactUrl = new URL("../lib/contracts/ModelRegistry.json", import.meta.url);
const outputUrl = new URL(
  "../tests/fixtures/offline-verification/local/",
  import.meta.url
);
const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
const provider = new ethers.JsonRpcProvider(LOCAL_RPC_URL);

const network = await provider.getNetwork();
const chainId = Number(network.chainId);
assertLocalFixtureNetwork(LOCAL_RPC_URL, chainId);

const contractAddress = resolveContractAddress({}, artifact.address, chainId);
const signer = await provider.getSigner(0);
const registry = new ethers.Contract(contractAddress, artifact.abi, signer);
const generatedAt = "2026-08-12T00:00:00.000Z";
const preliminary = await createOfflineFixtureArtifacts({
  chainId,
  contractAddress,
  batchId: 1,
  registeredAt: 1,
  generatedAt,
});

await provider.send("evm_setNextBlockTimestamp", [FIXTURE_REGISTRATION_TIMESTAMP]);
const transaction = await registry.registerMerkleRoot(
  preliminary.bundle.merkleRoot,
  [preliminary.bundle.modelId, "000000000000000000000002"]
);
const receipt = await transaction.wait();
if (!receipt || receipt.status !== 1) {
  throw new Error("Local Merkle-root registration did not complete successfully");
}

const batchId = Number(await registry.batchCount());
const [storedRoot, registeredAtValue, storedModelIds] =
  await registry.getMerkleRoot(batchId);
if (storedRoot.toLowerCase() !== preliminary.bundle.merkleRoot.toLowerCase()) {
  throw new Error("The Merkle root read from ModelRegistry does not match the fixture root");
}
if (storedModelIds.length !== 2) {
  throw new Error("The local fixture batch does not contain exactly two model IDs");
}
if (Number(registeredAtValue) !== FIXTURE_REGISTRATION_TIMESTAMP) {
  throw new Error("The local fixture registration timestamp is not deterministic");
}

const artifacts = await createOfflineFixtureArtifacts({
  chainId,
  contractAddress,
  batchId,
  registeredAt: Number(registeredAtValue),
  generatedAt,
});
artifacts.manifest.rpcNetworkName = network.name;
artifacts.manifest.receiptStatus = receipt.status;

await writeOfflineFixtureArtifacts(fileURLToPath(outputUrl), artifacts);

console.log(
  JSON.stringify(
    {
      outputDirectory: fileURLToPath(outputUrl),
      chainId,
      contractAddress,
      batchId,
      merkleRoot: artifacts.bundle.merkleRoot,
      receiptStatus: receipt.status,
    },
    null,
    2
  )
);
