---
title: Skills-over-MCP Demo Server
emoji: 🎲
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: "SEP-2640 v1 demo: Agent Skills served over MCP"
---

# Skills-over-MCP — demo server

A demo Model Context Protocol server serving [Agent Skills](https://agentskills.io/) per [SEP-2640 v1 (Skills Extension)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640), built on the v2 TypeScript SDK (`@modelcontextprotocol/server`) and the experimental skills extension SDK ([`@olaservo/ext-skills`](https://www.npmjs.com/package/@olaservo/ext-skills)). Maintained by the [Skills Over MCP Working Group](https://modelcontextprotocol.io/community/working-groups/skills-over-mcp).

## Endpoint

MCP over Streamable HTTP:

```
https://olaservo-skills-over-mcp-demo.hf.space/mcp
```

Modern clients (`versionNegotiation: { mode: "auto" }`) negotiate protocol revision 2026-07-28; 2025-era `initialize` clients are served from the same factory. The server declares `capabilities.extensions["io.modelcontextprotocol/skills"]` with `directoryRead: true`.

## What it serves

| Skill | Demonstrates |
|---|---|
| `skill://dice-roller/tabletop-dice/SKILL.md` | multi-segment path + `references/` supporting file |
| `skill://mcp-glossary/SKILL.md` | single-file skill |
| `skill://release-notes-writer/SKILL.md` | `templates/` supporting file |
| `skill://secret-menu/SKILL.md` | **unlisted** — absent from `skills/list`, reachable via `skills/get` and the server-instructions pointer |

Protocol surface: `skills/list` (verbatim frontmatter + complete `{uri, digest, size}` manifests, SEP-2549 `ttlMs`/`cacheScope` on 2026-07-28+ connections), `skills/get` (entries by URI, `-32602` for non-skills), `resources/read` (every file individually addressable), and `resources/directory/read`.

**Dice roller tool (enabled on this deployment, not part of SEP-2640)**: SEP-2640 defines no server-side tools — its reader-tool guidance is for host-provided tools. But tool-centric hosts need a tools surface (ChatGPT connector creation fails against a server whose `tools/list` errors, and VS Code stops a server whose tools are disabled), so this deployment runs with the opt-in `--dice-roller` flag, adding one tool: `roll_dice` (executes dice notation such as `2d6+3` or `2d20kh` and renders the result with an MCP Apps UI). It pairs with the `tabletop-dice` skill without substituting for it, and it stays off the skills path: reaching a skill still goes through the extension surface. SEP-aware hosts can ignore the tool.

## Try it

Quick check with MCP Inspector (CLI mode):

```bash
npx @modelcontextprotocol/inspector --cli https://olaservo-skills-over-mcp-demo.hf.space/mcp --transport http --method resources/list
```

Or interactively: `npx @modelcontextprotocol/inspector`, select **Streamable HTTP**, and enter the endpoint URL.

Read the unlisted skill directly by URI (the SEP-2640 baseline — a listing is never proof of absence):

```bash
npx @modelcontextprotocol/inspector --cli https://olaservo-skills-over-mcp-demo.hf.space/mcp --transport http --method resources/read --uri "skill://secret-menu/SKILL.md"
```

Free CPU Spaces sleep after inactivity — the first request after a sleep is slow; retry once.

## Testing the OpenAI skills import (Scan Tools)

OpenAI's [plugin platform](https://developers.openai.com/plugins/build/mcp-server) imports skills from an MCP server at submission time: the developer portal's **Scan Tools** connects over streamable HTTP, runs `skills/list` / `skills/get` / `resources/read`, verifies digests, and snapshots the skills into the plugin draft.

To test against this Space:

1. In the OpenAI developer portal, create a plugin whose MCP server URL is `https://olaservo-skills-over-mcp-demo.hf.space/mcp`.
2. Wake the Space first (any request, e.g. the Inspector command above) so the scan doesn't hit a cold start.
3. Run **Scan Tools** and inspect the imported draft.

Expected result: the 3 listed skills (`tabletop-dice`, `mcp-glossary`, `release-notes-writer`) import with digests verified; `secret-menu` does not appear, since the importer consumes only `skills/list` and unlisted skills are reachable only by URI. Either outcome is a useful interop data point for the working group.

The demo deliberately fits OpenAI's import limits (≤5 uniquely named skills, ≤100 files per skill, `SKILL.md` ≤256 KiB, supporting files ≤1 MiB).

## Source

Server source, smoke tests, the OpenAI-skills-import compatibility analysis, and the confirmed Scan Tools interop results live at [olaservo/skills-over-mcp-demo](https://github.com/olaservo/skills-over-mcp-demo). The skills are demo content authored for this server; the server packs nothing dynamic and is stateless, serving a startup snapshot with per-file SHA-256 digests.

## License

Apache-2.0
