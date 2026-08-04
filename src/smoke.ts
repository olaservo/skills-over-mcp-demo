#!/usr/bin/env node
/**
 * Smoke test (stdio): spawns the built server as a child process and runs the
 * shared SEP-2640 checks over a stdio connection negotiated to the latest
 * protocol revision. Exits non-zero on any failed check.
 *
 * Run with: npm run smoke
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { runChecks } from "./checks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "../dist/index.js");

async function main(): Promise<void> {
  const client = new Client(
    { name: "skills-demo-smoke", version: "0.1.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [serverPath] }),
  );

  console.log("Connected over stdio. Running checks:\n");
  const catalog = await runChecks(client);

  console.log("\n--- system-prompt catalog ---\n");
  console.log(catalog);

  await client.close();
  console.log("\nAll stdio checks passed.");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
