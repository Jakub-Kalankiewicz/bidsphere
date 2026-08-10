import { readFile, writeFile } from "node:fs/promises";

const verifierUrl = new URL("../public/verify.html", import.meta.url);
const coreUrl = new URL("../public/verify-core.mjs", import.meta.url);
const startMarker = "    /* VERIFY_CORE_START */";
const endMarker = "    /* VERIFY_CORE_END */";

const [verifier, moduleSource] = await Promise.all([
  readFile(verifierUrl, "utf8"),
  readFile(coreUrl, "utf8"),
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
const generated = `${verifier.slice(0, start)}${replacement}${verifier.slice(
  end + endMarker.length
)}`;

if (generated !== verifier) {
  await writeFile(verifierUrl, generated, "utf8");
}
