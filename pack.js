// Build a Chrome Web Store-ready ZIP under dist/.
//
// Usage: `npm run pack`
//
// What goes in: only the files Chrome's manifest references at runtime
// (manifest, bundled JS, popup HTML/CSS, feed CSS, icons). Everything else
// — src/, tests/, build config, lockfile, README — stays out.
//
// What this script does:
//   1. Sanity-check that manifest.json's version isn't an unreleased one
//      that's also still in package.json (drift prevention).
//   2. Run a fresh `npm run build` so the bundled .js at the repo root
//      reflects the current src/.
//   3. Verify each shipped file exists.
//   4. Zip into dist/sift-vX.Y.zip — version stamped from manifest.json.
//
// Skips minification on purpose: the bundles are ~100 KB total, source is
// public on GitHub, and the Chrome Web Store flags "obfuscated" code for
// extra review (slows submissions).

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";

const SHIPPED_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "feed.js",
  "popup.js",
  "popup.html",
  "popup.css",
  "feed.css",
  "icons",
];

function fail(msg) {
  console.error("❌ " + msg);
  process.exit(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const version = manifest.version;
if (!version) fail("manifest.json has no `version` field.");
if (!/^\d+(\.\d+){0,3}$/.test(version)) {
  fail(
    `manifest version "${version}" doesn't look like a Chrome version (expected up to 4 dotted numbers).`
  );
}
// package.json uses semver (3 segments). Allow either to lead, but warn on drift.
const manifestNumeric = version.split(".").map(Number).join(".");
const pkgNumeric = (pkg.version || "")
  .split(".")
  .map(Number)
  .filter((n) => !Number.isNaN(n))
  .join(".");
if (manifestNumeric !== pkgNumeric.split(".").slice(0, version.split(".").length).join(".")) {
  console.warn(
    `⚠️  Version drift: manifest=${version}, package.json=${pkg.version}. ` +
      "These should agree. Continuing — but bump both before publishing."
  );
}

console.log(`Packaging Sift v${version}…`);
console.log(`Building bundle from src/ first…`);
execSync("node build.js", { stdio: "inherit" });

for (const f of SHIPPED_FILES) {
  if (!existsSync(f)) fail(`Required file missing: ${f}`);
}

// Compute uncompressed total to give the user a sanity check upfront.
let uncompressed = 0;
function walk(p) {
  const st = statSync(p);
  if (st.isFile()) {
    uncompressed += st.size;
    return;
  }
  for (const child of execSync(`ls "${p}"`, { encoding: "utf8" }).trim().split("\n")) {
    if (!child) continue;
    walk(`${p}/${child}`);
  }
}
SHIPPED_FILES.forEach(walk);
console.log(`Source tree to ship: ${formatBytes(uncompressed)}`);

const distDir = "dist";
const zipName = `sift-v${version}.zip`;
const zipPath = `${distDir}/${zipName}`;

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// `-r` recurses into icons/. `-X` strips macOS resource forks + UID/GID
// metadata that the Chrome Web Store doesn't care about.
execSync(`zip -r -X "${zipPath}" ${SHIPPED_FILES.map((f) => `"${f}"`).join(" ")}`, {
  stdio: "inherit",
});

const zipSize = statSync(zipPath).size;
console.log("");
console.log(`✅ Created ${zipPath}`);
console.log(`   Size:        ${formatBytes(zipSize)} (compressed)`);
console.log(`   Version:     ${version}`);
console.log("");
console.log("Next steps:");
console.log("  1. Upload the ZIP to the Chrome Web Store Developer Dashboard");
console.log("     https://chrome.google.com/webstore/devconsole/");
console.log("  2. Bump the version in manifest.json + package.json before the next release");
