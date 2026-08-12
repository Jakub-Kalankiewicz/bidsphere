import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryDirectory = fileURLToPath(new URL("../", import.meta.url));
const contractsDirectory = fileURLToPath(new URL("../contracts/", import.meta.url));
const hardhatBinary = fileURLToPath(
  new URL("../contracts/node_modules/.bin/hardhat", import.meta.url)
);
const fixtureRpcUrl = "http://127.0.0.1:18545";

async function rpc(method, params = []) {
  const response = await fetch(fixtureRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`Fixture RPC ${method} failed: ${JSON.stringify(payload.error)}`);
  }
  return payload.result;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

async function waitForRpc(processHandle, diagnostics) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(
        `Fixture Hardhat node exited with status ${processHandle.exitCode}: ${diagnostics()}`
      );
    }
    try {
      if ((await rpc("eth_chainId")) === "0x7a69") return;
    } catch {
      // The node is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Fixture Hardhat node did not become ready");
}

const nodeProcess = spawn(hardhatBinary, ["node", "--port", "18545"], {
  cwd: contractsDirectory,
  env: { ...process.env, BIDSPHERE_FIXTURE_MODE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let nodeDiagnostics = "";
const collectDiagnostics = (chunk) => {
  nodeDiagnostics = `${nodeDiagnostics}${chunk}`.slice(-8_000);
};
nodeProcess.stdout.on("data", collectDiagnostics);
nodeProcess.stderr.on("data", collectDiagnostics);

try {
  await waitForRpc(nodeProcess, () => nodeDiagnostics);
  run(
    hardhatBinary,
    ["run", "scripts/deploy.ts", "--network", "fixture"],
    contractsDirectory
  );
  run(process.execPath, ["scripts/create-offline-fixture.mjs"], repositoryDirectory);
  run(process.execPath, ["scripts/build-offline-verifier.mjs"], repositoryDirectory);
} finally {
  if (nodeProcess.exitCode === null) {
    nodeProcess.kill("SIGTERM");
    await new Promise((resolve) => nodeProcess.once("exit", resolve));
  }
}
