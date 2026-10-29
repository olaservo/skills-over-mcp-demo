#!/usr/bin/env node
/**
 * Smoke test (streamable HTTP): spawns the built HTTP server with
 * `--dice-roller` (the Space's configuration), then runs the shared SEP-2640
 * checks once as a modern client (auto version negotiation → 2026-07-28) and
 * once as a 2025-11-25 client. This is the transport OpenAI's Scan Tools
 * import uses.
 *
 * Run with: npm run smoke:http
 *
 * Pass a URL to check a remote endpoint instead of spawning the local server:
 *   tsx src/smoke-http.ts https://example.hf.space/mcp
 *
 * @license Apache-2.0
 */

import * as assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
  type VersionNegotiationMode,
} from "@modelcontextprotocol/client";
import { LEGACY_PROTOCOL, MODERN_PROTOCOL, runChecks } from "./checks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "../dist/http.js");
const PORT = Number(process.env.SMOKE_PORT ?? 3599);

function startServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [serverPath, "--port", String(PORT), "--dice-roller"],
      { stdio: ["ignore", "inherit", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
      if (stderr.includes("Streamable HTTP endpoint")) {
        resolve(child);
      }
    });
    child.on("exit", (code) =>
      reject(new Error(`server exited early with code ${code}`)),
    );
  });
}

async function run(
  url: string,
  mode: VersionNegotiationMode,
  expectedProtocol: string,
  expectDiceRoller: boolean,
): Promise<void> {
  const client = new Client(
    { name: "skills-demo-smoke-http", version: "0.1.0" },
    { versionNegotiation: { mode } },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));

  console.log(`\nConnected over streamable HTTP (${url}, ${expectedProtocol}). Running checks:\n`);
  await runChecks(client, expectedProtocol);

  if (expectDiceRoller) {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      ["roll_dice"],
    );
    console.log("  ok  tools/list: roll_dice (--dice-roller)");
  }

  await client.close();
}

async function main(): Promise<void> {
  const remoteUrl = process.argv[2];
  const server = remoteUrl ? undefined : await startServer();
  const url = remoteUrl ?? `http://127.0.0.1:${PORT}/mcp`;
  try {
    await run(url, "auto", MODERN_PROTOCOL, !remoteUrl);
    await run(url, "legacy", LEGACY_PROTOCOL, !remoteUrl);
    console.log("\nAll HTTP checks passed.");
  } finally {
    server?.kill();
  }
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
