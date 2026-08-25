#!/usr/bin/env node
/**
 * skills-over-mcp-demo — streamable HTTP entry point.
 *
 * Serves the same SEP-2640 surface as the stdio entry over streamable HTTP,
 * for MCP Inspector validation and OpenAI's plugin Scan Tools import (which
 * requires an HTTP endpoint). `createMcpHandler` owns the protocol era per
 * request: modern clients negotiate the 2026-07-28 revision, 2025-era
 * `initialize` traffic is served statelessly from the same factory.
 *
 * Usage:
 *   node dist/http.js [path/to/skills] [--port 3000] [--host 127.0.0.1]
 *                     [--allow-host <hostname>]... [--public]
 *
 * The endpoint binds 127.0.0.1 and validates Host/Origin headers against
 * localhost by default. When fronting it with a local tunnel, pass the
 * tunnel's assigned hostname via --allow-host:
 *
 *   node dist/http.js --allow-host <tunnel-hostname>
 *
 * Behind a platform proxy that owns routing and TLS (e.g. a Hugging Face
 * Space), bind all interfaces and disable the header guards — the Host
 * guard is a DNS-rebinding defense for localhost binds, and the platform's
 * routing is the real access control there:
 *
 *   node dist/http.js --host 0.0.0.0 --port 7860 --public
 *
 * Requests without an Origin header (non-browser MCP clients, scanners) pass
 * the Origin guard by design.
 *
 * @license Apache-2.0
 */

import { createServer } from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  hostHeaderValidation,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildServerFactory, loadSkills, logSkillMap } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    port: { type: "string", default: process.env.PORT ?? "3000" },
    host: { type: "string", default: process.env.HOST ?? "127.0.0.1" },
    "allow-host": { type: "string", multiple: true, default: [] },
    public: { type: "boolean", default: false },
    "dice-roller": { type: "boolean", default: false },
  },
});

const port = Number(values.port);
const bindHost = values.host;
const isPublic = values.public;
const skillsDir = positionals[0]
  ? path.resolve(positionals[0])
  : path.resolve(__dirname, "../skills");

const skillMap = loadSkills(skillsDir);
logSkillMap(skillMap, skillsDir);

const LOCALHOST = ["localhost", "127.0.0.1", "[::1]"];
const allowedHosts = [...LOCALHOST, ...values["allow-host"]];

const handler = createMcpHandler(
  buildServerFactory(skillMap, skillsDir, {
    diceRoller: values["dice-roller"],
  }),
);
const nodeHandler = toNodeHandler(handler);
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedHosts);

const httpServer = createServer((req, res) => {
  if (!isPublic) {
    if (!validateHost(req, res)) return;
    if (!validateOrigin(req, res)) return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");

  // OpenAI plugin-submission domain verification: serve the challenge token
  // for this hostname. Set via env (a Space variable on Hugging Face), so the
  // token can be rotated without a code push.
  if (url.pathname === "/.well-known/openai-apps-challenge") {
    const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN;
    if (token) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(token);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("OPENAI_APPS_CHALLENGE_TOKEN not configured.\n");
    }
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found. The MCP endpoint is at /mcp.\n");
    return;
  }

  void nodeHandler(req, res);
});

httpServer.listen(port, bindHost, () => {
  console.error(
    `[skills-over-mcp-demo] Streamable HTTP endpoint: http://${bindHost}:${port}/mcp`,
  );
  console.error(
    isPublic
      ? "[skills-over-mcp-demo] Host/Origin guards disabled (--public)"
      : `[skills-over-mcp-demo] Allowed Host headers: ${allowedHosts.join(", ")}`,
  );
  console.error(
    "[skills-over-mcp-demo] Extension: io.modelcontextprotocol/skills (directoryRead: true)",
  );
});
