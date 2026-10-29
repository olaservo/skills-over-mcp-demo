/**
 * Skills catalog for the demo.
 *
 * The SDK's `loadSkills` discovers the folder and computes every file's
 * digest and size. A catalog it builds lists every skill it serves, so the
 * entries are served through a `SkillSource` instead: `skills/list` and
 * `resources/list` leave the unlisted skills out, while `skills/get`,
 * `resources/read` and `resources/directory/read` answer for every skill.
 * That is the SEP's partial-listing baseline: hosts reach `secret-menu`
 * through the instructions pointer and confirm it via `skills/get`.
 *
 * @license Apache-2.0
 */

import { createHash } from "node:crypto";
import { ProtocolError, ProtocolErrorCode, type Resource } from "@modelcontextprotocol/server";
import {
  DIRECTORY_MIME_TYPE,
  SkillsExtension,
  type Skill,
  type SkillSource,
  type SkillsOptions,
} from "@modelcontextprotocol/server/ext/skills";
import { loadSkills, nodeSkillFiles } from "@modelcontextprotocol/server/ext/skills/node";

const BASE_URI = "skill://";
const MANIFEST = "/SKILL.md";

export interface DemoSkillsOptions {
  /** Skill paths (`secret-menu`) served but kept out of skills/list and resources/list. */
  unlisted?: readonly string[];
  cacheHint?: SkillsOptions["cacheHint"];
}

export interface DemoSkills {
  extension: SkillsExtension;
  /** Every skill served, listed or not, sorted by URI. */
  entries: readonly Skill[];
  /** `SKILL.md` URIs of the unlisted skills. */
  unlisted: ReadonlySet<string>;
}

interface PublishedFile {
  /** Path relative to the skills folder. */
  path: string;
  digest: string;
  size: number;
  mimeType: string;
}

// The SDK's catalog keeps its MIME table private; this mirrors it.
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  py: "text/x-python",
  sh: "application/x-sh",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/typescript",
  html: "text/html",
  css: "text/css",
  csv: "text/csv",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

function mimeTypeFor(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
  return Object.hasOwn(MIME_BY_EXTENSION, extension)
    ? MIME_BY_EXTENSION[extension]!
    : "application/octet-stream";
}

function canonical(uri: string): string | undefined {
  try {
    return new URL(uri).href;
  } catch {
    return undefined;
  }
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

// Keeps a BOM, so the text re-encodes to the bytes the digest covers.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Loads the folder with the SDK and wraps the entries in a `SkillSource`
 * that hides `options.unlisted` from listings. Reads go to disk and are
 * checked against the published size and digest, as the SDK catalog does.
 */
export async function loadDemoSkills(
  skillsDir: string,
  options: DemoSkillsOptions = {},
): Promise<DemoSkills> {
  const catalog = await loadSkills(skillsDir);
  const files = nodeSkillFiles(skillsDir);
  const unlisted = new Set(
    (options.unlisted ?? []).map((skillPath) => `${BASE_URI}${skillPath}${MANIFEST}`),
  );

  const skills = new Map<string, Skill>();
  const published = new Map<string, PublishedFile>();
  const dirs = new Map<string, Resource[]>();

  for (const skill of catalog.entries) {
    skills.set(skill.uri, skill);
    if (skill.resources === "dynamic") continue;
    const root = skill.uri.slice(0, -MANIFEST.length);
    for (const { uri, digest, size } of skill.resources) {
      const segments = uri.slice(root.length + 1).split("/");
      const mimeType = mimeTypeFor(decodeURIComponent(segments[segments.length - 1]!));
      published.set(uri, {
        path: uri.slice(BASE_URI.length).split("/").map(decodeURIComponent).join("/"),
        digest,
        size,
        mimeType,
      });
      // The file in its directory, and each directory in its parent, down from the skill folder.
      let dir = root;
      segments.forEach((segment, index) => {
        const childUri = `${dir}/${segment}`;
        let children = dirs.get(dir);
        if (children === undefined) {
          children = [];
          dirs.set(dir, children);
        }
        if (!children.some((child) => child.uri === childUri)) {
          const name = decodeURIComponent(segment);
          children.push(
            index === segments.length - 1
              ? { uri: childUri, name, mimeType, size }
              : { uri: childUri, name, mimeType: DIRECTORY_MIME_TYPE },
          );
        }
        dir = childUri;
      });
    }
  }
  for (const children of dirs.values()) {
    children.sort((a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0));
  }

  const listed = catalog.entries.filter((skill) => !unlisted.has(skill.uri));

  const source: SkillSource = {
    async list({ cursor }) {
      if (cursor !== undefined) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown cursor: ${cursor}`);
      }
      return { skills: listed };
    },
    async get(uri) {
      const key = canonical(uri);
      return key === undefined ? undefined : skills.get(key);
    },
    async read(uri) {
      const key = canonical(uri);
      const file = key === undefined ? undefined : published.get(key);
      if (file === undefined) return undefined;
      const bytes = await files.read(file.path);
      if (bytes.byteLength !== file.size || sha256(bytes) !== file.digest) {
        throw new ProtocolError(
          ProtocolErrorCode.InternalError,
          `${uri} changed since the skills catalog was loaded; restart the server`,
        );
      }
      const text = decodeUtf8(bytes);
      return text === undefined
        ? { bytes, mimeType: file.mimeType }
        : { text, mimeType: file.mimeType };
    },
    async readDirectory(uri, { cursor }) {
      if (cursor !== undefined) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown cursor: ${cursor}`);
      }
      const key = canonical(uri);
      const children = key === undefined ? undefined : dirs.get(key);
      return children === undefined ? undefined : { resources: children };
    },
    async listResources() {
      return listed.map((skill) => ({
        uri: skill.uri,
        name: skill.frontmatter.name,
        description: skill.frontmatter.description,
        mimeType: "text/markdown",
        ...(published.has(skill.uri) ? { size: published.get(skill.uri)!.size } : {}),
      }));
    },
  };

  return {
    extension: new SkillsExtension({ source, cacheHint: options.cacheHint }),
    entries: catalog.entries,
    unlisted,
  };
}
