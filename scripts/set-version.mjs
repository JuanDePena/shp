#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionPattern = /^\d{4}\.\d{2}\.\d{2}$/;

function computeTodayVersion() {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `${year}${month}.${day}.00`;
}

function readTrackedFiles() {
  return execFileSync("git", ["-C", repoRoot, "ls-files"], {
    encoding: "utf8"
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveRequestedVersion(argv) {
  const requested = argv[2];

  if (!requested) {
    throw new Error("Usage: node scripts/set-version.mjs <YYMM.DD.NN|--today>");
  }

  const version = requested === "--today" ? computeTodayVersion() : requested;

  if (!versionPattern.test(version)) {
    throw new Error(`Invalid version "${version}". Expected YYMM.DD.NN.`);
  }

  return version;
}

function updatePackageJson(filePath, version) {
  const absolutePath = path.join(repoRoot, filePath);
  const payload = JSON.parse(readFileSync(absolutePath, "utf8"));

  if (payload.version === version) {
    return false;
  }

  payload.version = version;
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
  return true;
}

function updateEnvExample(filePath, version) {
  const absolutePath = path.join(repoRoot, filePath);
  const current = readFileSync(absolutePath, "utf8");
  const updated = current.replace(
    /^(SHP_VERSION|SHM_VERSION)=.*$/m,
    `$1=${version}`
  );

  if (updated === current) {
    return false;
  }

  writeFileSync(absolutePath, updated);
  return true;
}

function main() {
  const version = resolveRequestedVersion(process.argv);
  const trackedFiles = readTrackedFiles();
  const packageJsonFiles = trackedFiles.filter(
    (filePath) => filePath === "package.json" || filePath.endsWith("/package.json")
  );
  const envExampleFiles = trackedFiles.filter(
    (filePath) => filePath.startsWith("packaging/env/") && filePath.endsWith(".env.example")
  );
  const changedFiles = [];

  for (const filePath of packageJsonFiles) {
    if (updatePackageJson(filePath, version)) {
      changedFiles.push(filePath);
    }
  }

  for (const filePath of envExampleFiles) {
    if (updateEnvExample(filePath, version)) {
      changedFiles.push(filePath);
    }
  }

  console.log(
    JSON.stringify(
      {
        repoRoot,
        version,
        updatedFiles: changedFiles
      },
      null,
      2
    )
  );
}

main();
