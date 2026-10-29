# skills-over-mcp-demo

Demo MCP server that serves [Agent Skills](https://agentskills.io/) over MCP per [SEP-2640 v1 (Skills Extension)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640), built on the v2 TypeScript SDK (`@modelcontextprotocol/server` 2.4, whose `ext/skills` module serves the extension).

## Quickstart

```bash
npm install
npm run smoke       # build + end-to-end client checks over stdio
npm run smoke:http  # same checks over streamable HTTP (the transport OpenAI's importer uses)
```

Both smoke tests connect with `versionNegotiation: { mode: "auto" }` and assert the connection lands on the latest protocol revision (2026-07-28) and that both `skills/list` and `skills/get` results carry the SEP-2549 caching attributes (`ttlMs`, `cacheScope`), which the SEP scopes to that revision. They also assert that `resources/read` of a `SKILL.md` returns `mimeType: text/markdown`.

Or run the server directly for use from a host:

```bash
npm run build
node dist/index.js                    # stdio, serves the bundled skills/ directory
node dist/index.js path/to/dir        # stdio, different skills directory
node dist/http.js --port 3000        # streamable HTTP at http://127.0.0.1:3000/mcp
```

Claude Desktop / generic stdio host config:

```json
{
  "mcpServers": {
    "skills-over-mcp-demo": {
      "command": "node",
      "args": ["<absolute path>/dist/index.js"]
    }
  }
}
```

## What it demonstrates

| SEP-2640 surface | Where |
|---|---|
| Capability declaration `capabilities.extensions["io.modelcontextprotocol/skills"]` | `SkillsExtension.attach()` declares it before connect |
| `skills/list` — entries with verbatim frontmatter + complete `{uri, digest}` manifest | 3 listed skills |
| `skills/get` — entry retrieval by URI, listed or not; `-32602` for non-skills | the unlisted `secret-menu` skill |
| Partial listings + server `instructions` as a skill pointer | `secret-menu` is served but never enumerated; instructions point to it |
| `resources/read` — every skill file individually addressable | `skill://…` resources + catch-all template |
| `resources/directory/read` (optional, gated on `directoryRead`) | declared and implemented |
| SEP-2549 list-caching attributes on `skills/list` (2026-07-28+) | `ttlMs: 60_000`, `cacheScope: "public"` |
| Multi-segment skill paths | `skill://dice-roller/tabletop-dice/SKILL.md` |
| Opt-in tools bridge (`--tools-bridge`) | `list_skills` + `read_skill` (read-only, `annotations.readOnlyHint`) |

Interop finding: **ChatGPT connector creation fails against a tools-less MCP server** — the "New Plugin" dialog errors out generically when `tools/list` returns `-32601`, even though the server is a valid SEP-2640 skills/resources server. The `--tools-bridge` flag exists for that case. It is **off by default and not part of SEP-2640**: the SEP defines no server-side tools (its reader-tool guidance is for host-provided tools), so the default surface stays pure-SEP. The flag mirrors that host-side reader tool server-side so tool-only hosts can consume the skills at all; the HF Space deployment enables it.

Skills served:

```
skill://dice-roller/tabletop-dice/SKILL.md    multi-segment path, references/ supporting file
skill://mcp-glossary/SKILL.md                 single-file skill
skill://release-notes-writer/SKILL.md         templates/ supporting file
skill://secret-menu/SKILL.md                  UNLISTED — reachable via skills/get + instructions pointer only
```

The smoke test (`src/smoke.ts`) exercises the client side of the SEP through the SDK's `SkillsClient`: capability gating, enumeration, unlisted-skill retrieval, digest + frontmatter verification on reads, unlisted-file rejection semantics, directory walking, and merging the instructions-pointer skill with the listing. Each run repeats the checks on a 2025-11-25 connection, where the caching attributes must be absent.

## Public endpoint (Hugging Face Space)

The server is deployed as a public Docker Space at [`olaservo/skills-over-mcp-demo`](https://huggingface.co/spaces/olaservo/skills-over-mcp-demo):

```
https://olaservo-skills-over-mcp-demo.hf.space/mcp
```

Deployment lives in `hf-space/`: `assemble.ps1` stages a self-contained bundle (source + skills + Dockerfile + Space README) into `hf-space/.staging`, then `hf upload olaservo/skills-over-mcp-demo hf-space/.staging . --repo-type space` pushes it. Verify the live endpoint with `tsx src/smoke-http.ts https://olaservo-skills-over-mcp-demo.hf.space/mcp`. Free CPU Spaces sleep after inactivity; the first request after a sleep is slow.

Deployment note: the first push got auto-flagged by HF's abuse handler (rule "Cloudflare" — tunnel-domain strings in a source docstring). Removing the `trycloudflare.com` references and recreating the Space cleared it; keep tunnel hostnames out of Space content.

## Testing the OpenAI skills import (Scan Tools)

OpenAI imports skills server-side: during plugin submission, the developer portal's **Scan Tools** connects to your MCP server over streamable HTTP, runs `skills/list` / `skills/get` / `resources/read`, verifies digests, and snapshots the skills into the plugin draft. Codex and ChatGPT then receive skills from OpenAI's plugin backend, not from your server. The test ladder:

1. **Local validation with MCP Inspector** (OpenAI's prescribed pre-submission check):

   ```bash
   npm run start:http                                     # terminal 1
   npx @modelcontextprotocol/inspector                    # terminal 2 → Streamable HTTP → http://127.0.0.1:3000/mcp
   # or non-interactive:
   npx @modelcontextprotocol/inspector --cli http://127.0.0.1:3000/mcp --transport http --method resources/list
   ```

2. **Expose publicly** — the deployed Hugging Face Space above is the stable public endpoint. (Alternative: a quick tunnel — start one against `http://localhost:3000`, then restart the server with `--allow-host <tunnel-hostname>`.)

3. **Run Scan Tools** in the OpenAI developer portal against `https://olaservo-skills-over-mcp-demo.hf.space/mcp` during plugin creation, then check the imported draft.

**Result (2026-08-03): confirmed.** Scan Tools imported all 3 listed skills with "Passed" validation; unlisted `secret-menu` did not import (the importer consumes only `skills/list`). Full findings — including the tools-surface requirement for ChatGPT connectors and the explicit-annotations validation — in [`docs/openai-plugin-submission.md`](docs/openai-plugin-submission.md). Expected: the 3 listed skills import with digests verified; `secret-menu` does not (their importer consumes only `skills/list`). Then exercise the plugin in ChatGPT developer mode.

The demo intentionally fits OpenAI's import limits (≤5 uniquely named skills, ≤100 files/skill, `SKILL.md` ≤256 KiB, files ≤1 MiB).

## OpenAI skills import vs SEP-2640

OpenAI's [MCP server plugin docs](https://developers.openai.com/plugins/build/mcp-server#import-skills-from-the-mcp-server) support importing skills from an MCP server, and their mechanism is recognizably SEP-2640 v1. Checked against the current SEP text (PR #2640, `seps/2640-skills-extension.md`):

**Matches the SEP:**

- Capability declared at `capabilities.extensions["io.modelcontextprotocol/skills"]` — OpenAI's docs even call out that the earlier `experimental` location is wrong.
- `skills/list` (paginated via `nextCursor`) returning `uri`, verbatim `frontmatter` (with required `name` and `description`), and a complete `resources` manifest; `skills/get` for single-entry retrieval; content fetched via `resources/read`.
- Digest format `sha256:` + 64 lowercase hex chars; text resources hashed over the UTF-8 bytes of `content.text`, blob resources hashed over the base64-decoded bytes — exactly the SEP's raw-bytes rule.
- Directory-name-equals-skill-name (the SEP's "final `<skill-path>` segment MUST equal `frontmatter.name`").
- Import-time verification that fetched content matches digests and that `SKILL.md` frontmatter matches the catalog entry exactly — both host-side MUSTs in the SEP.
- Rejecting skills whose resources aren't all fetchable/digestible — the SEP says hosts MAY decline skills without a `resources` manifest, and OpenAI does.

**Differences (host policy or stricter-than-SEP):**

- **`skill://` treated as required.** OpenAI says "use the `skill://` URI convention." The SEP says servers SHOULD use `skill://` but MAY serve skills under any scheme, and hosts MUST NOT infer skill-ness from the scheme. If OpenAI's scanner actually rejects non-`skill://` URIs, that's stricter than the SEP — a conformant `github://…` skills server would fail import. Practical takeaway: stick to `skill://` (as this demo does) for maximum compatibility.
- **Import limits are OpenAI policy, not SEP.** ≤5 uniquely named skills per scan, ≤10 catalog pages, ≤100 files per skill, `SKILL.md` ≤256 KiB, supporting files ≤1 MiB, ≤5 MiB per skill — none of these appear in the SEP. A conformant server can exceed them and simply won't import fully.
- **Archives are OpenAI-internal.** Their "generated archives per scan ≤8 MiB" limit refers to post-import packaging on their side. The SEP explicitly removed archive distribution from the wire protocol (see its Deferred Features appendix); no conflict, but worth knowing the archive never crosses the MCP connection.
- **Snapshot-only, listing-only.** OpenAI imports at scan time and requires re-scanning to pick up changes — consistent with the SEP's point-in-time entries. But an import pipeline only consumes `skills/list`, so SEP features aimed at live hosts don't apply: unlisted skills (like this demo's `secret-menu`), the instructions pointer, and `resources/directory/read` are invisible to OpenAI's importer. Servers targeting OpenAI import should list everything they want imported.

## Layout

```
src/server.ts      shared factory: loadSkills() + SkillsExtension.attach()
src/skills.ts      SkillSource over the SDK catalog that keeps secret-menu out of listings
src/index.ts       stdio entry point (serveStdio)
src/http.ts        streamable HTTP entry point (createMcpHandler + @modelcontextprotocol/node)
src/checks.ts      shared SEP-2640 client-side checks
src/smoke.ts       stdio smoke test
src/smoke-http.ts  streamable HTTP smoke test
skills/            the demo skills (Agent Skills format: SKILL.md + supporting files)
```
