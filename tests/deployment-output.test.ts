import assert from "node:assert/strict";
import test from "node:test";

import { getDeploymentOutputPath } from "../contracts/scripts/deployment-output.ts";

test("keeps local deployments in the application contract artifact", () => {
  assert.equal(
    getDeploymentOutputPath("localhost", "/repo"),
    "/repo/lib/contracts/ModelRegistry.json"
  );
  assert.equal(
    getDeploymentOutputPath("fixture", "/repo"),
    "/repo/lib/contracts/ModelRegistry.json"
  );
});

test("stores Sepolia deployments separately from the local artifact", () => {
  assert.equal(
    getDeploymentOutputPath("sepolia", "/repo"),
    "/repo/measurements/deployments/sepolia/ModelRegistry.json"
  );
});
