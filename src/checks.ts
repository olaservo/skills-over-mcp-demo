/**
 * Shared SEP-2640 client-side checks, run by both smoke entries
 * (`smoke.ts` over stdio, `smoke-http.ts` over streamable HTTP) on a
 * 2026-07-28 connection and again on a 2025-11-25 one.
 *
 * @license Apache-2.0
 */

import * as assert from "node:assert/strict";
import { ResourceNotFoundError, type Client } from "@modelcontextprotocol/client";
import {
  SKILL_LIMITS,
  SKILLS_GET_METHOD,
  SkillsClient,
  SkillVerificationError,
} from "@modelcontextprotocol/client/ext/skills";
import * as z from "zod/v4";

const SECRET_URI = "skill://secret-menu/SKILL.md";
const DICE_DIR_URI = "skill://dice-roller/tabletop-dice";
const DICE_URI = `${DICE_DIR_URI}/SKILL.md`;
const DICE_REF_URI = `${DICE_DIR_URI}/references/dice-notation.md`;

export const MODERN_PROTOCOL = "2026-07-28";
export const LEGACY_PROTOCOL = "2025-11-25";

/** What the server advertises as its cache hint; see `loadSkills` in server.ts. */
const CACHE_HINT = { ttlMs: 60_000, cacheScope: "public" } as const;

function pass(label: string): void {
  console.log(`  ok  ${label}`);
}

/**
 * SEP-2549 caching attributes: present with the configured values on a
 * 2026-07-28 connection, absent on 2025-11-25.
 */
function checkCacheFields(
  result: { ttlMs?: number; cacheScope?: string },
  modern: boolean,
  label: string,
): void {
  if (modern) {
    assert.equal(result.ttlMs, CACHE_HINT.ttlMs, `${label} ttlMs`);
    assert.equal(result.cacheScope, CACHE_HINT.cacheScope, `${label} cacheScope`);
  } else {
    assert.equal(result.ttlMs, undefined, `${label} ttlMs absent on legacy`);
    assert.equal(result.cacheScope, undefined, `${label} cacheScope absent on legacy`);
  }
}

/** Every file URI below a directory, through `resources/directory/read`. */
async function walkDirectory(skills: SkillsClient, uri: string): Promise<string[]> {
  const { resources } = await skills.readDirectory(uri);
  const files: string[] = [];
  for (const child of resources) {
    if (child.mimeType === "inode/directory") {
      files.push(...(await walkDirectory(skills, child.uri)));
    } else {
      files.push(child.uri);
    }
  }
  return files;
}

export async function runChecks(client: Client, expectedProtocol: string): Promise<void> {
  const modern = expectedProtocol === MODERN_PROTOCOL;

  // 0. The connection landed on the revision the smoke asked for
  assert.equal(client.getNegotiatedProtocolVersion(), expectedProtocol);
  pass(`protocol: negotiated ${expectedProtocol}`);

  // 1. Capability declaration
  const skills = new SkillsClient(client);
  assert.ok(skills.supported, "extension capability declared");
  assert.ok(skills.directoryRead, "directoryRead declared");
  pass("capabilities: io.modelcontextprotocol/skills + directoryRead");

  // 2. skills/list — secret-menu must NOT be enumerated
  const listing = await skills.list();
  assert.deepEqual(listing.invalid, []);
  const uris = listing.skills.map((s) => s.uri).sort();
  assert.deepEqual(uris, [
    DICE_URI,
    "skill://mcp-glossary/SKILL.md",
    "skill://release-notes-writer/SKILL.md",
  ]);
  pass(`skills/list: ${listing.skills.length} listed entries, secret-menu omitted`);

  // 2b. resources/list leaves it out as well
  const { resources: listedResources } = await client.listResources();
  const listedSkillUris = listedResources
    .map((r) => r.uri)
    .filter((uri) => uri.startsWith("skill://"))
    .sort();
  assert.deepEqual(listedSkillUris, uris);
  pass("resources/list: the listed SKILL.md files only");

  // 3. SEP-2549 caching attributes on skills/list, scoped to 2026-07-28+
  checkCacheFields(listing, modern, "skills/list");
  pass(
    modern
      ? "skills/list: SEP-2549 ttlMs + cacheScope present"
      : "skills/list: SEP-2549 ttlMs + cacheScope omitted on 2025-11-25",
  );

  // 4. Every listed entry carries frontmatter + a complete {uri, digest, size}
  // manifest (these are static skills, so never "dynamic"), within the
  // SEP's per-skill limits
  for (const entry of listing.skills) {
    assert.ok(entry.frontmatter.name, `${entry.uri} has frontmatter.name`);
    assert.ok(entry.frontmatter.description, `${entry.uri} has description`);
    assert.notEqual(entry.resources, "dynamic", `${entry.uri} resources is an array`);
    const manifest = entry.resources as Exclude<typeof entry.resources, "dynamic">;
    assert.ok(
      manifest.some((r) => r.uri === entry.uri),
      `${entry.uri} manifest includes SKILL.md itself`,
    );
    let bytes = 0;
    for (const r of manifest) {
      assert.match(r.digest, /^sha256:[0-9a-f]{64}$/);
      assert.ok(Number.isInteger(r.size) && r.size > 0, `${r.uri} has a size`);
      bytes += r.size;
    }
    assert.ok(manifest.length <= SKILL_LIMITS.files, `${entry.uri} within the file limit`);
    assert.ok(bytes <= SKILL_LIMITS.bytes, `${entry.uri} within the size limit`);
  }
  pass("entries: verbatim frontmatter + sha256 digest and size for every file, within limits");

  // 5. skills/get answers for the unlisted skill, with the caching attributes
  const secret = await skills.get(SECRET_URI);
  assert.equal(secret.skill.frontmatter.name, "secret-menu");
  checkCacheFields(secret, modern, "skills/get");
  if (modern) {
    // A single entry is not a list: no cursor on the raw result
    const raw = await client.request(
      { method: SKILLS_GET_METHOD, params: { uri: SECRET_URI } },
      z.looseObject({ skill: z.looseObject({ uri: z.string() }) }),
    );
    assert.equal(raw.skill.uri, SECRET_URI);
    assert.ok(!("nextCursor" in raw), "skills/get result has no nextCursor");
  }
  pass("skills/get: unlisted secret-menu retrievable by URI");

  // 6. skills/get errors -32602 for a non-skill URI
  await assert.rejects(
    skills.get("skill://no-such-skill/SKILL.md"),
    (err: unknown) => (err as { code?: number }).code === -32602,
  );
  pass("skills/get: -32602 for a URI the server does not serve as a skill");

  // 7. Digest + frontmatter verified SKILL.md read, served as text/markdown
  const dice = listing.skills.find((s) => s.uri === DICE_URI)!;
  const diceMd = await skills.read(dice);
  assert.ok(diceMd.verified);
  assert.match(diceMd.text ?? "", /Tabletop Dice/);
  assert.equal(diceMd.mimeType, "text/markdown");
  pass("read: SKILL.md digest + frontmatter verification passed, mimeType text/markdown");

  // 8. Verified supporting-file read (size + digest)
  const ref = await skills.read(dice, "references/dice-notation.md");
  assert.ok(ref.verified);
  assert.match(ref.text ?? "", /Dice Notation Reference/);
  pass("read: supporting file verified against manifest size + digest");

  // 8b. A file the entry does not list is refused before any request, and
  // the server answers resources/read for it with resource-not-found
  await assert.rejects(
    skills.read(dice, "references/missing.md"),
    (err: unknown) => err instanceof SkillVerificationError && err.reason === "unlisted",
  );
  await assert.rejects(
    client.readResource({ uri: `${DICE_DIR_URI}/references/missing.md` }),
    (err: unknown) => ResourceNotFoundError.isInstance(err),
  );
  pass("read: unlisted file refused by the client and not served by the server");

  // 9. Directory enumeration
  const first = await skills.readDirectory(DICE_DIR_URI);
  assert.deepEqual(
    first.resources.map((r) => `${r.name} ${r.mimeType}`),
    ["SKILL.md text/markdown", "references inode/directory"],
  );
  checkCacheFields(first, modern, "resources/directory/read");
  const files = (await walkDirectory(skills, DICE_DIR_URI)).sort();
  assert.deepEqual(files, [DICE_URI, DICE_REF_URI]);
  pass("resources/directory/read: walked skill directory");

  // 10. The instructions pointer folds the unlisted skill into the catalog
  const instructions = client.getInstructions() ?? "";
  const pointed = [...instructions.matchAll(/skill:\/\/\S+?\/SKILL\.md/g)].map((m) => m[0]);
  assert.deepEqual(pointed, [SECRET_URI]);
  const catalog = new Map(listing.skills.map((s) => [s.uri, s]));
  for (const uri of pointed) {
    catalog.set(uri, (await skills.get(uri)).skill);
  }
  assert.equal(catalog.size, 4);
  pass("instructions: pointer to secret-menu merged with the listing (4 skills total)");
}
