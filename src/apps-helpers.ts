/**
 * Server-side MCP Apps (SEP-1865) helpers against the v2 MCP TypeScript SDK.
 *
 * Replaces `@modelcontextprotocol/ext-apps/server`, which still peer-depends on
 * the v1 SDK (`@modelcontextprotocol/sdk@^1.29`) and can't load alongside
 * `@modelcontextprotocol/server@2` (upstream migration: ext-apps issue #702).
 * The wire format is unchanged and SDK-generation-independent: these produce
 * byte-identical `_meta` / mimeType output to ext-apps@1.7.5, whose server
 * entry is only the ~40 lines of normalization reproduced here. Drop this
 * module when ext-apps ships a v2-SDK release (note: that release also renames
 * iframe-bridge wire methods, so it's a coordinated host+iframe upgrade).
 *
 * Copied verbatim from olaservo/agent-skills-ttrpg-demo
 * (mcp/ttrpg-helper/apps-helpers.ts). Keep the two in sync, or extract to a
 * shared package if a third server needs it.
 */
import type {
  McpServer,
  ReadResourceCallback,
  RegisteredResource,
  RegisteredTool,
  ResourceMetadata,
  StandardSchemaWithJSON,
  ToolCallback,
} from "@modelcontextprotocol/server";

/** Deprecated flat `_meta` key, still emitted for host compatibility. */
export const RESOURCE_URI_META_KEY = "ui/resourceUri";
/** MIME type marking a resource as an MCP Apps HTML UI. */
export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

interface AppToolUiMeta {
  resourceUri?: string;
  [key: string]: unknown;
}

export interface AppToolConfig<Input extends StandardSchemaWithJSON | undefined> {
  title?: string;
  description?: string;
  inputSchema?: Input;
  outputSchema?: StandardSchemaWithJSON;
  _meta: Record<string, unknown> & { ui?: AppToolUiMeta };
}

/**
 * `registerTool` plus the ext-apps `_meta` normalization: mirror the nested
 * `_meta.ui.resourceUri` and the deprecated flat `_meta["ui/resourceUri"]`
 * into each other so hosts on either convention find the UI resource.
 */
export function registerAppTool<Input extends StandardSchemaWithJSON | undefined = undefined>(
  server: McpServer,
  name: string,
  config: AppToolConfig<Input>,
  cb: ToolCallback<Input>,
): RegisteredTool {
  const meta = config._meta;
  const nested = meta.ui?.resourceUri;
  const legacy = meta[RESOURCE_URI_META_KEY] as string | undefined;
  let normalized = meta;
  if (nested && !legacy) {
    normalized = { ...meta, [RESOURCE_URI_META_KEY]: nested };
  } else if (legacy && !nested) {
    normalized = { ...meta, ui: { ...(meta.ui ?? {}), resourceUri: legacy } };
  }
  // Cast at the delegate only: registerTool's overloads infer schema generics
  // from inline literals, which a pass-through wrapper can't re-derive.
  return server.registerTool(
    name,
    { ...config, _meta: normalized } as Parameters<McpServer["registerTool"]>[1],
    cb as Parameters<McpServer["registerTool"]>[2],
  );
}

/** `registerResource` with the MCP Apps mimeType default (config can override). */
export function registerAppResource(
  server: McpServer,
  name: string,
  uri: string,
  config: ResourceMetadata,
  cb: ReadResourceCallback,
): RegisteredResource {
  return server.registerResource(name, uri, { mimeType: RESOURCE_MIME_TYPE, ...config }, cb);
}
