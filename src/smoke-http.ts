#!/usr/bin/env node
/**
 * Smoke test (streamable HTTP): spawns the built HTTP server, connects a
 * modern client (auto version negotiation → 2026-07-28), and runs the shared
 * SEP-2640 checks. This is the transport OpenAI's Scan Tools import uses.
 *
 * Run with: npm run smoke:http
 *
 * Pass a URL to check a remote endpoint instead of spawning the local server:
 *   tsx src/smoke-http.ts https://example.hf.space/mcp
 *
 * @license Apache-2.0
 */

import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { runChecks } from "./checks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "../dist/http.js");
const PORT = 3599;

function startServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath, "--port", String(PORT)], {
      stdio: ["ignore", "inherit", "pipe"],
    });
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

async function main(): Promise<void> {
  const remoteUrl = process.argv[2];
  const server = remoteUrl ? undefined : await startServer();
  const url = remoteUrl ?? `http://127.0.0.1:${PORT}/mcp`;
  try {
    const client = new Client(
      { name: "skills-demo-smoke-http", version: "0.1.0" },
      { versionNegotiation: { mode: "auto" } },
    );
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));

    console.log(`\nConnected over streamable HTTP (${url}). Running checks:\n`);
    await runChecks(client);

    await client.close();
    console.log("\nAll HTTP checks passed.");
  } finally {
    server?.kill();
  }
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
