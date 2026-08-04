# OpenAI plugin submission — checklist for the skills-import test

Goal: get the demo server through the [plugin submission portal](https://platform.openai.com/plugins) far enough that **Scan Tools** runs the SEP-2640 skills import against `https://olaservo-skills-over-mcp-demo.hf.space/mcp`, and record what it imports.

## Prerequisites (account-side, can't be scripted)

- OpenAI platform account with **Apps Management** write permission in the org.
- Verified developer identity (individual or business) — the portal walks through this.
- Optional first: test the connection informally in ChatGPT developer mode (Settings → Security and login → Developer mode → Plugins → add connection → public endpoint `https://olaservo-skills-over-mcp-demo.hf.space/mcp`). Note: developer mode tests the connection; the skills import itself happens at submission via Scan Tools.

## Domain verification (server-side, already wired)

The portal issues a verification token that must be served at `https://olaservo-skills-over-mcp-demo.hf.space/.well-known/openai-apps-challenge`. The server serves whatever the `OPENAI_APPS_CHALLENGE_TOKEN` env var holds. When the portal shows the token, set it as a Space variable (restarts the Space automatically):

```bash
python -c "from huggingface_hub import HfApi; HfApi().add_space_variable('olaservo/skills-over-mcp-demo', 'OPENAI_APPS_CHALLENGE_TOKEN', '<token-from-portal>')"
```

Then confirm: `curl https://olaservo-skills-over-mcp-demo.hf.space/.well-known/openai-apps-challenge`

## MCP tab

- **URL type**: Universal (fixed server URL).
- **Server URL**: `https://olaservo-skills-over-mcp-demo.hf.space/mcp`
- **Auth**: none — public, read-only demo server. No demo credentials needed.
- **Tool annotations**: the server registers **no tools** (skills/resources only). If the portal hard-requires at least one annotated tool, that itself is a working-group finding — record it. (`readOnlyHint` would be true for everything this server does.)

## Skills (the actual test) — ✅ CONFIRMED 2026-08-03

Scan Tools ran successfully against the HF Space endpoint. Results, matching the SEP-2640 predictions exactly:

- **3 skills imported, all "Passed"**: `tabletop-dice`, `mcp-glossary`, `release-notes-writer` — digest verification, frontmatter identity, and limits all clean.
- **`secret-menu` absent**, confirming the importer consumes only `skills/list`; unlisted skills (reachable via `skills/get` / instructions pointer) do not import.

Findings collected along the way:

1. **ChatGPT connector creation requires a tools surface** — creating the developer-mode connector failed with a generic error while the server returned `-32601` for `tools/list`. Fixed by the opt-in `--tools-bridge` (`list_skills` + `read_skill`), which is not part of SEP-2640.
2. **Scan Tools requires all three tool annotations explicitly** (`readOnlyHint`, `openWorldHint`, `destructiveHint`) — it does not apply the MCP spec's documented defaults (spec default for a missing `destructiveHint` is `true`; OpenAI validates absence as an error).
3. **Domain verification worked via the env-configured well-known route**: token at `/.well-known/openai-apps-challenge`, set through the `OPENAI_APPS_CHALLENGE_TOKEN` Space variable, default challenge base URL.

## Suggested listing metadata

- **Name**: Skills over MCP Demo
- **Category**: Developer tools
- **Short description**: Demo plugin serving Agent Skills over MCP per SEP-2640 — dice rolling, MCP glossary, and release-notes workflows.
- **Website**: https://huggingface.co/spaces/olaservo/skills-over-mcp-demo
- **Support / privacy / terms URLs**: point at the working-group repo (or your own pages) — the portal requires all three for public listing.

## Starter prompts

1. Roll 4d6 keep the highest 3, six times, for a new character.
2. What's the difference between an MCP host, client, and server?
3. Turn this list of merged PRs into release notes for v0.2.0.

## Test cases (portal asks for 5 positive, 3 negative)

Positive:

1. "Roll 2d6+3" → uses the tabletop-dice skill, shows individual dice and total.
2. "What does 2d20kl1 mean?" → explains disadvantage per the dice-notation reference.
3. "What is MCP elicitation?" → answers from the mcp-glossary skill definitions.
4. "Draft release notes for these changes: added skills/get, fixed digest bug" → uses the release-notes-writer template, breaking changes first.
5. "Roll a d20 with advantage" → rolls twice, keeps the higher, marks the kept roll.

Negative (out of scope, should not invoke the plugin):

1. "What's the weather in Paris tomorrow?"
2. "Book me a flight to Tokyo."
3. "Summarize this PDF I'm uploading."

## After submission

- Approval → choose publication timing; the plugin lists in the Plugins Directory (ChatGPT & Codex).
- Skill changes on the server do **not** propagate: re-run Scan Tools and resubmit a new plugin version.
- Free HF Spaces sleep after 48 h idle — wake the endpoint (any request) before OpenAI's scan or review sessions.
