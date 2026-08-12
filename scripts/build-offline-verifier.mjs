import { readFile, writeFile } from "node:fs/promises";

const verifierUrl = new URL("../public/verify.html", import.meta.url);
const coreUrl = new URL("../public/verify-core.mjs", import.meta.url);
const configUrl = new URL(
  "../tests/fixtures/offline-verification/local/verifier-config.json",
  import.meta.url
);
const startMarker = "    /* VERIFY_CORE_START */";
const endMarker = "    /* VERIFY_CORE_END */";
const configStartMarker = "    /* VERIFIER_CONFIG_START */";
const configEndMarker = "    /* VERIFIER_CONFIG_END */";

const [verifier, moduleSource, configText] = await Promise.all([
  readFile(verifierUrl, "utf8"),
  readFile(coreUrl, "utf8"),
  readFile(configUrl, "utf8"),
]);

const start = verifier.indexOf(startMarker);
const end = verifier.indexOf(endMarker);
if (start === -1 || end === -1 || end <= start) {
  throw new Error("Offline verifier core markers are missing or invalid");
}
if (moduleSource.includes("</script")) {
  throw new Error("Verification core cannot contain a closing script tag");
}

const inlineCore = moduleSource
  .replace(/^export\s+/gm, "")
  .split("\n")
  .map((line) => (line ? `    ${line}` : ""))
  .join("\n")
  .trimEnd();
const replacement =
  `${startMarker}\n` +
  "    /* Generated from verify-core.mjs by scripts/build-offline-verifier.mjs. */\n" +
  `${inlineCore}\n` +
  endMarker;
let generated = `${verifier.slice(0, start)}${replacement}${verifier.slice(
  end + endMarker.length
)}`;

const config = JSON.parse(configText);
const configStart = generated.indexOf(configStartMarker);
const configEnd = generated.indexOf(configEndMarker);
if (configStart === -1 || configEnd === -1 || configEnd <= configStart) {
  throw new Error("Offline verifier configuration markers are missing or invalid");
}
const serializedConfig = JSON.stringify(config);
const configReplacement =
  `${configStartMarker}\n` +
  `    /* ${serializedConfig} */\n` +
  "    const VERIFIER_CONFIG = Object.freeze({\n" +
  `      chainId: ${config.chainId},\n` +
  `      contractAddress: ${JSON.stringify(config.contractAddress)},\n` +
  `      trustedRoots: Object.freeze(${JSON.stringify(config.trustedRoots)}),\n` +
  "    });\n" +
  configEndMarker;
generated =
  generated.slice(0, configStart) +
  configReplacement +
  generated.slice(configEnd + configEndMarker.length);

if (generated !== verifier) {
  await writeFile(verifierUrl, generated, "utf8");
}
