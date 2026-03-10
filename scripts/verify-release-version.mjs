#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const tagName = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!tagName) {
  throw new Error("Missing release tag. Pass a tag name or set GITHUB_REF_NAME.");
}

const match = String(tagName).match(
  /^v(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/,
);

if (!match?.groups) {
  throw new Error(
    `Release tags must use the stable vX.Y.Z format. Received: ${tagName}`,
  );
}

const expectedVersion = `${match.groups.major}.${match.groups.minor}.${match.groups.patch}`;
const packageJsonPath = path.resolve(process.argv[3] ?? "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

if (packageJson.version !== expectedVersion) {
  throw new Error(
    `Tag ${tagName} does not match package.json version ${packageJson.version}.`,
  );
}

process.stdout.write(expectedVersion);
