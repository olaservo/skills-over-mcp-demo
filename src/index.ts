#!/usr/bin/env node
/**
 * skills-over-mcp-demo — stdio entry point.
 *
 * Serves the bundled `skills/` directory as Agent Skills over MCP per
 * SEP-2640 v1. See `server.ts` for the shared factory and `http.ts` for the
 * streamable HTTP entry point.
 *
 * Skills served:
 *   skill://dice-roller/tabletop-dice/SKILL.md   multi-segment path + references/
 *   skill://mcp-glossary/SKILL.md                single file, no supporting files
 *   skill://release-notes-writer/SKILL.md        templates/ supporting file
 *   skill://secret-menu/SKILL.md                 UNLISTED — skills/get + instructions only
 *
 * Usage:
 *   node dist/index.js [path/to/skills]
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildServerFactory, loadSkills, logSkillMap } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "tools-bridge": { type: "boolean", default: false },
  },
});

const skillsDir = positionals[0]
  ? path.resolve(positionals[0])
  : path.resolve(__dirname, "../skills");

const skillMap = loadSkills(skillsDir);
logSkillMap(skillMap, skillsDir);

serveStdio(
  buildServerFactory(skillMap, skillsDir, {
    toolsBridge: values["tools-bridge"],
  }),
);

console.error(
  "[skills-over-mcp-demo] Extension: io.modelcontextprotocol/skills (directoryRead: true)",
);
console.error("[skills-over-mcp-demo] Listening on stdio");
