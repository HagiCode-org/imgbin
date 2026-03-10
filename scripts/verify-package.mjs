#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(process.argv[2] ?? ".");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const binPath = packageJson.bin?.imgbin;

if (!binPath) {
  throw new Error("package.json must define bin.imgbin before publishing.");
}

const resolvedBinPath = path.join(repoRoot, binPath);
if (!fs.existsSync(resolvedBinPath)) {
  throw new Error(`Missing built CLI entrypoint: ${binPath}`);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const output = execFileSync(npmCommand, ["pack", "--dry-run", "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
});
const [packSummary] = JSON.parse(output);
const packedFiles = new Set((packSummary?.files ?? []).map((file) => file.path));
const requiredFiles = [binPath, "README.md", "prompts/default-analysis-prompt.txt"];
const missingFiles = requiredFiles.filter((file) => !packedFiles.has(file));

if (missingFiles.length > 0) {
  throw new Error(
    `npm pack is missing required publish files: ${missingFiles.join(", ")}`,
  );
}

process.stdout.write(
  `Verified ${packSummary.name} with ${packSummary.files.length} packed files.\n`,
);
