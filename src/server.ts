/**
 * Shared server factory for the skills-over-mcp demo.
 *
 * Both entry points (stdio in `index.ts`, streamable HTTP in `http.ts`) build
 * their per-connection servers from `buildServerFactory()`, so the SEP-2640
 * surface — capability declaration, skills/list + skills/get handlers,
 * resources, directory read — is identical on every transport and protocol
 * era. The v2 SDK entry points (`serveStdio`, `createMcpHandler`) own the era
 * decision: modern clients negotiate the 2026-07-28 revision, legacy clients
 * get a 2025-era connection from the same factory.
 *
 * @license Apache-2.0
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import {
  discoverSkills,
  registerSkillResources,
  type SkillMetadata,
} from "@olaservo/ext-skills/server";
import * as z from "zod/v4";

export type SkillMap = Map<string, SkillMetadata>;

export const SERVER_INSTRUCTIONS = [
  "This server exposes Agent Skills under the skill:// scheme.",
  "For coffee recommendations, read skill://secret-menu/SKILL.md — it does not appear in skills/list.",
].join("\n");

/**
 * Discover skills from disk (per-file SHA-256 digests are computed here,
 * once) and mark `secret-menu` unlisted: it is served but never enumerated,
 * demonstrating the SEP's partial-listing baseline — hosts reach it through
 * the instructions pointer and confirm it via skills/get.
 */
export function loadSkills(skillsDir: string): SkillMap {
  const skillMap = discoverSkills(skillsDir);
  const secretMenu = skillMap.get("secret-menu");
  if (secretMenu) {
    secretMenu.listed = false;
  }
  return skillMap;
}

export function logSkillMap(skillMap: SkillMap, skillsDir: string): void {
  console.error(
    `[skills-over-mcp-demo] Discovered ${skillMap.size} skill(s) in ${skillsDir}`,
  );
  for (const [skillPath, skill] of skillMap) {
    const files = 1 + skill.documents.length;
    const tag = skill.listed === false ? " (unlisted)" : "";
    console.error(
      `  - skill://${skillPath}/SKILL.md (name: "${skill.name}", ${files} file(s))${tag}`,
    );
  }
}

export interface ServerFactoryOptions {
  /**
   * Register the `list_skills` / `read_skill` tools bridge. OFF by default:
   * SEP-2640 defines no server-side tools — its reader-tool guidance is for
   * HOST-provided tools — so the default surface is the pure SEP one. Enable
   * for tool-centric hosts (ChatGPT connector creation fails when tools/list
   * errors); the public HF Space deployment enables it for that reason.
   */
  toolsBridge?: boolean;
}

/**
 * Returns a factory building one McpServer per connection, with the skills
 * extension registered before the connection serves anything — capabilities
 * ship in the handshake (initialize result or server/discover).
 */
export function buildServerFactory(
  skillMap: SkillMap,
  skillsDir: string,
  options: ServerFactoryOptions = {},
): () => McpServer {
  return () => {
    const server = new McpServer(
      { name: "skills-over-mcp-demo", version: "0.1.0" },
      { capabilities: { resources: {} }, instructions: SERVER_INSTRUCTIONS },
    );

    registerSkillResources(server, skillMap, skillsDir, {
      template: true,
      directoryRead: true,
      // SEP-2549 list-caching attributes (emitted on 2026-07-28+ connections
      // only): a static filesystem catalog with nothing user-specific may be
      // cached briefly and shared across authorization contexts.
      ttlMs: 60_000,
      cacheScope: "public",
    });

    if (options.toolsBridge) {
      registerToolsBridge(server, skillMap);
    }

    return server;
  };
}

/**
 * Opt-in tools bridge for tool-centric hosts (ChatGPT connectors require a
 * working tools surface — connector creation fails against a server whose
 * tools/list errors). NOT part of SEP-2640: the SEP's reader tool is a
 * host-side affordance, and this mirrors it server-side so tool-only hosts
 * can consume the skills at all. `list_skills` surfaces the catalog,
 * `read_skill` reads any served skill file by URI — including unlisted
 * skills, matching resources/read.
 */
function registerToolsBridge(server: McpServer, skillMap: SkillMap): void {
  server.registerTool(
    "list_skills",
    {
      title: "List Skills",
      description:
        "List the Agent Skills this server provides: name, description, and the skill:// URI of each skill's SKILL.md. Call read_skill with a URI to load a skill's full instructions before acting on a matching task.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    async () => {
      const entries = [...skillMap.values()]
        .filter((s) => s.listed !== false)
        .map((s) => ({
          name: s.name,
          description: s.description,
          uri: `skill://${s.skillPath}/SKILL.md`,
        }));
      return {
        content: [{ type: "text", text: JSON.stringify({ skills: entries }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "read_skill",
    {
      title: "Read Skill File",
      description:
        "Read a skill file by its skill:// URI — the SKILL.md returned by list_skills, or a supporting file the SKILL.md references (relative paths resolve against the skill's directory).",
      inputSchema: z.object({
        uri: z
          .string()
          .describe("Skill file URI, e.g. skill://mcp-glossary/SKILL.md"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    async ({ uri }) => {
      const fail = (text: string) => ({
        content: [{ type: "text" as const, text }],
        isError: true,
      });

      if (!uri.startsWith("skill://")) {
        return fail(`Unsupported URI scheme: ${uri}`);
      }
      const rest = uri.slice("skill://".length);

      // Longest-prefix match so nested skill paths resolve to the right skill.
      const skillPath = [...skillMap.keys()]
        .filter((p) => rest.startsWith(`${p}/`))
        .sort((a, b) => b.length - a.length)[0];
      const skill = skillPath ? skillMap.get(skillPath) : undefined;
      if (!skillPath || !skill) {
        return fail(`No skill serves ${uri}`);
      }

      const filePath = rest.slice(skillPath.length + 1);
      if (filePath === "SKILL.md") {
        return {
          content: [{ type: "text", text: skill.content ?? "" }],
        };
      }

      // Supporting files are served only from the discovery manifest — the
      // documents list is the allowlist, so no path can escape the skill dir.
      const doc = skill.documents.find((d) => d.path === filePath);
      if (!doc) {
        return fail(`${uri} is not a file of skill "${skill.name}"`);
      }
      const text = fs.readFileSync(path.join(skill.skillDir, doc.path), "utf-8");
      return { content: [{ type: "text", text }] };
    },
  );
}
