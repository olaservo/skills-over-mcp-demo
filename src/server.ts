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
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "./apps-helpers.js";
import { NotationError, rollNotation } from "./dice.js";

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
   * Register the `roll_dice` tool and its MCP Apps UI resource. OFF by
   * default: SEP-2640 defines no server-side tools, so the default surface is
   * the pure SEP one.
   *
   * Two reasons it exists, neither of them SEP-2640:
   *
   * 1. Some hosts drive MCP server lifecycle entirely off tools. VS Code's
   *    autostart calls `startServerAndWaitForLiveTools`, and disabling a
   *    server's tools stops the server — which takes its skills with it. A
   *    server that serves only skills has no lifecycle in such a host, so a
   *    non-empty `tools/list` is what keeps it alive. Tool-centric hosts need
   *    one for a second reason: ChatGPT connector creation fails against a
   *    server whose `tools/list` errors.
   * 2. It pairs with the `tabletop-dice` skill without substituting for it.
   *    The skill teaches notation and interpretation (advantage, exploding
   *    dice, when a check succeeds); the tool only executes an already-parsed
   *    roll and renders it.
   *
   * Point 2 is deliberate. An earlier `list_skills`/`read_skill` bridge lived
   * here and was removed: it gave a model a second way to reach the skills,
   * so a successful run said nothing about whether the host's own skill
   * loading worked. Any tool added here should stay off the skills path.
   */
  diceRoller?: boolean;
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

    if (options.diceRoller) {
      registerDiceRoller(server);
    }

    return server;
  };
}

/** MCP Apps UI resource backing `roll_dice`. */
const DICE_UI_URI = "ui://skills-over-mcp-demo/dice-roller.html";

/**
 * Minimal, self-contained UI: no build step, no external requests.
 *
 * Display-only by design. A fully interactive MCP App — re-roll calling back
 * through `app.callServerTool()`, host theming, the `ontoolinput` /
 * `ontoolresult` lifecycle — needs the `@modelcontextprotocol/ext-apps`
 * browser runtime bundled by vite, which is more apparatus than this server
 * warrants. See olaservo/agent-skills-ttrpg-demo for that treatment.
 */
function diceUiHtml(): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Dice Roller</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 1rem;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .notation { font-weight: 600; opacity: .75; margin-bottom: .5rem; }
  .dice { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .75rem; }
  .die {
    min-width: 2.2rem; padding: .45rem .5rem;
    border: 1px solid currentColor; border-radius: .4rem;
    text-align: center; font-variant-numeric: tabular-nums; font-weight: 600;
  }
  .die.dropped { opacity: .35; text-decoration: line-through; }
  .total { font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .detail { opacity: .7; font-size: .85rem; margin-top: .25rem; }
  .seed { opacity: .5; font-size: .75rem; margin-top: .5rem; }
  .empty { opacity: .6; }
</style>
<div id="root" class="empty">Waiting for a roll…</div>
<script>
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function render(result) {
    if (!result || !Array.isArray(result.rolls)) return;
    var root = document.getElementById("root");
    root.className = "";
    var dice = result.rolls
      .map(function (r) {
        return '<div class="die' + (r.dropped ? " dropped" : "") + '">' + esc(r.value) + "</div>";
      })
      .join("");
    root.innerHTML =
      '<div class="notation">' + esc(result.notation) + "</div>" +
      '<div class="dice">' + dice + "</div>" +
      '<div class="total">' + esc(result.total) + "</div>" +
      '<div class="detail">' + esc(result.detail) + "</div>" +
      (result.seed === undefined ? "" : '<div class="seed">seed ' + esc(result.seed) + "</div>");
  }

  // Hosts deliver the tool result to the iframe by postMessage. Shapes differ
  // between host implementations, so accept the common ones rather than
  // binding to one.
  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data) return;
    render(data.structuredContent || (data.result && data.result.structuredContent) || data.result || data);
  });
</script>`;
}

/**
 * Registers `roll_dice` and its UI resource via the MCP Apps helpers, which
 * emit both the nested `_meta.ui.resourceUri` and the deprecated flat
 * `_meta["ui/resourceUri"]` so hosts on either convention find the UI.
 *
 * Hosts without MCP Apps ignore the `_meta` entirely and show the text
 * content, so this degrades cleanly.
 */
function registerDiceRoller(server: McpServer): void {
  registerAppResource(
    server,
    "dice-roller-ui",
    DICE_UI_URI,
    { description: "Dice roller UI for the roll_dice tool." },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: diceUiHtml() }],
    }),
  );

  registerAppTool(
    server,
    "roll_dice",
    {
      title: "Roll Dice",
      description:
        "Roll dice from standard notation (2d6+3, d20, 2d20kh for advantage, 2d20kl for disadvantage) and return the individual dice and total. Executes a roll only — choosing the notation, and reading the outcome, is what the tabletop-dice skill covers.",
      inputSchema: z.object({
        notation: z
          .string()
          .describe("Dice notation, e.g. '2d6+3', 'd20', '2d20kh', '4d8-1'."),
        seed: z
          .number()
          .int()
          .optional()
          .describe("Optional integer seed. Same seed and notation always roll the same dice."),
      }),
      _meta: { ui: { resourceUri: DICE_UI_URI } },
    },
    async ({ notation, seed }) => {
      let outcome;
      try {
        outcome = rollNotation(notation, seed);
      } catch (err) {
        if (err instanceof NotationError) {
          return {
            content: [{ type: "text" as const, text: err.message }],
            isError: true,
          };
        }
        throw err;
      }

      return {
        content: [{ type: "text" as const, text: `${outcome.notation}: ${outcome.detail}` }],
        structuredContent: outcome as unknown as Record<string, unknown>,
        _meta: { ui: { resourceUri: DICE_UI_URI } },
      };
    },
  );
}
