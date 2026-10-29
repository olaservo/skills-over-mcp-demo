#!/usr/bin/env node
/**
 * Smoke test (stdio): spawns the built server as a child process and runs the
 * shared SEP-2640 checks over stdio, once negotiated to the latest protocol
 * revision and once as a 2025-11-25 client. Exits non-zero on any failed
 * check.
 *
 * Run with: npm run smoke
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, type VersionNegotiationMode } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { LEGACY_PROTOCOL, MODERN_PROTOCOL, runChecks } from "./checks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "../dist/index.js");

async function run(mode: VersionNegotiationMode, expectedProtocol: string): Promise<void> {
  const client = new Client(
    { name: "skills-demo-smoke", version: "0.1.0" },
    { versionNegotiation: { mode } },
  );
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [serverPath] }),
  );

  console.log(`\nConnected over stdio (${expectedProtocol}). Running checks:\n`);
  await runChecks(client, expectedProtocol);
  await client.close();
}

async function main(): Promise<void> {
  await run("auto", MODERN_PROTOCOL);
  await run("legacy", LEGACY_PROTOCOL);
  console.log("\nAll stdio checks passed.");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
