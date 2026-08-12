import path from "path";

export function getDeploymentOutputPath(
  networkName: string,
  repositoryRoot: string
): string {
  if (networkName === "sepolia") {
    return path.join(
      repositoryRoot,
      "measurements",
      "deployments",
      "sepolia",
      "ModelRegistry.json"
    );
  }

  return path.join(repositoryRoot, "lib", "contracts", "ModelRegistry.json");
}
