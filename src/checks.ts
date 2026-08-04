/**
 * Shared SEP-2640 client-side checks, run by both smoke entries
 * (`smoke.ts` over stdio, `smoke-http.ts` over streamable HTTP).
 *
 * @license Apache-2.0
 */

import * as assert from "node:assert/strict";
import type { Client } from "@modelcontextprotocol/client";
import {
  SKILLS_LIST_METHOD,
  SkillsListResultSchema,
} from "@olaservo/ext-skills";
import {
  serverSupportsSkills,
  serverSupportsDirectoryRead,
  listSkills,
  getSkill,
  readSkill,
  readSkillResource,
  walkDirectory,
  discoverAndBuildCatalog,
} from "@olaservo/ext-skills/client";

const SECRET_URI = "skill://secret-menu/SKILL.md";
const DICE_URI = "skill://dice-roller/tabletop-dice/SKILL.md";
const DICE_REF_URI = "skill://dice-roller/tabletop-dice/references/dice-notation.md";

const LATEST_PROTOCOL = "2026-07-28";

function pass(label: string): void {
  console.log(`  ok  ${label}`);
}

export async function runChecks(client: Client): Promise<string> {
  // 0. Latest spec: the client's auto negotiation must land on 2026-07-28
  assert.equal(client.getNegotiatedProtocolVersion(), LATEST_PROTOCOL);
  pass(`protocol: negotiated ${LATEST_PROTOCOL} (latest revision)`);

  // 1. Capability declaration
  assert.ok(serverSupportsSkills(client), "extension capability declared");
  assert.ok(serverSupportsDirectoryRead(client), "directoryRead declared");
  pass("capabilities: io.modelcontextprotocol/skills + directoryRead");

  // 2. skills/list — secret-menu must NOT be enumerated
  const skills = await listSkills(client);
  const uris = skills.map((s) => s.uri).sort();
  assert.deepEqual(uris, [
    DICE_URI,
    "skill://mcp-glossary/SKILL.md",
    "skill://release-notes-writer/SKILL.md",
  ]);
  pass(`skills/list: ${skills.length} listed entries, secret-menu omitted`);

  // 3. Latest spec: raw skills/list result carries the SEP-2549 caching
  // attributes, which the SEP scopes to 2026-07-28+ connections
  const raw = await client.request(
    { method: SKILLS_LIST_METHOD, params: {} },
    SkillsListResultSchema,
  );
  assert.equal(raw.ttlMs, 60_000);
  assert.equal(raw.cacheScope, "public");
  pass("skills/list: SEP-2549 ttlMs + cacheScope present (2026-07-28 scoping)");

  // 4. Every listed entry carries frontmatter + complete resources manifest
  for (const entry of skills) {
    assert.ok(entry.frontmatter?.name, `${entry.uri} has frontmatter.name`);
    assert.ok(entry.frontmatter?.description, `${entry.uri} has description`);
    assert.ok(
      entry.resources?.some((r) => r.uri === entry.uri),
      `${entry.uri} manifest includes SKILL.md itself`,
    );
    for (const r of entry.resources ?? []) {
      assert.match(r.digest, /^sha256:[0-9a-f]{64}$/);
    }
  }
  pass("entries: verbatim frontmatter + sha256 digests for every file");

  // 5. skills/get answers for the unlisted skill
  const secret = await getSkill(client, SECRET_URI);
  assert.equal(secret.frontmatter?.name, "secret-menu");
  pass("skills/get: unlisted secret-menu retrievable by URI");

  // 6. skills/get errors -32602 for a non-skill URI
  await assert.rejects(
    getSkill(client, "skill://no-such-skill/SKILL.md"),
    (err: unknown) => (err as { code?: number }).code === -32602,
  );
  pass("skills/get: -32602 for a URI the server does not serve as a skill");

  // 7. Digest-verified SKILL.md read (+ frontmatter identity check)
  const dice = skills.find((s) => s.uri === DICE_URI)!;
  const diceMd = await readSkill(client, dice);
  assert.match(diceMd, /Tabletop Dice/);
  pass("readSkill: digest + frontmatter verification passed");

  // 8. Verified supporting-file read
  const ref = await readSkillResource(client, dice, DICE_REF_URI);
  assert.match(ref.text ?? "", /Dice Notation Reference/);
  pass("readSkillResource: supporting file verified against manifest digest");

  // 9. Directory enumeration
  const files = await walkDirectory(client, "skill://dice-roller/tabletop-dice");
  const names = files.map((f) => f.uri).sort();
  assert.deepEqual(names, [DICE_URI, DICE_REF_URI]);
  pass("resources/directory/read: walked skill directory");

  // 10. Instructions mining folds the unlisted skill into the catalog
  const { skills: discovered, catalog } = await discoverAndBuildCatalog(client, {
    serverName: "skills-over-mcp-demo",
    instructions: true,
  });
  assert.ok(
    discovered.some((s) => s.uri === SECRET_URI),
    "secret-menu discovered via instructions pointer",
  );
  assert.equal(discovered.length, 4);
  pass("discoverAndBuildCatalog: instructions pointer merged (4 skills total)");

  return catalog;
}
