#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const child = spawn("npm", ["publish", ...args], {
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});

let combinedOutput = "";

child.stdout.on("data", (chunk) => {
  const text = String(chunk);
  combinedOutput += text;
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = String(chunk);
  combinedOutput += text;
  process.stderr.write(text);
});

child.on("error", (error) => {
  console.error(`Failed to start npm publish: ${error.message}`);
  process.exit(1);
});

child.on("close", (code, signal) => {
  if (signal) {
    console.error(`npm publish terminated by signal ${signal}.`);
    process.exit(1);
  }

  if (code === 0) {
    process.exit(0);
  }

  const packageName = "@hagicode/imgbin";
  const sawE404 =
    combinedOutput.includes("npm error code E404") ||
    combinedOutput.includes("npm ERR! code E404");
  const mentionsPackage =
    combinedOutput.includes(packageName) ||
    combinedOutput.includes("@hagicode%2fimgbin") ||
    combinedOutput.includes("@hagicode%2Fimgbin");

  if (sawE404 && mentionsPackage) {
    console.error("");
    console.error("Additional diagnostics for @hagicode/imgbin publish:");
    console.error("- The GitHub Actions OIDC publish step reached npm, so this is usually not a local packaging problem.");
    console.error("- Confirm the npm scope or organization `hagicode` already exists.");
    console.error("- Confirm the publishing identity can create or update `@hagicode/imgbin` under that scope.");
    console.error("- Confirm npm trusted publishing is configured for package `@hagicode/imgbin`, owner `HagiCode-org`, repository `imgbin`, workflow filename `npm-publish.yml`, and an empty environment unless the workflow declares one.");
  }

  process.exit(code ?? 1);
});
