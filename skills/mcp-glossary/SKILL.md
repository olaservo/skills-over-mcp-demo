---
name: mcp-glossary
description: Define Model Context Protocol terms precisely (host, client, server, resource, tool, prompt, sampling, elicitation, extension, SEP). Use when the user asks what an MCP term means or how MCP concepts relate.
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# MCP Glossary

Answer questions about Model Context Protocol terminology with precise, spec-grounded definitions.

## Core Terms

- **Host** — the application the user interacts with (IDE, chat app, agent). Owns model access, approvals, and the UI. One host runs one or more clients.
- **Client** — the protocol endpoint inside the host that maintains a 1:1 connection with a server.
- **Server** — a program exposing context and capabilities (resources, tools, prompts) over MCP.
- **Resource** — addressable content identified by URI, read via `resources/read`. Application-controlled context.
- **Tool** — a model-invokable function with a JSON Schema signature, called via `tools/call`.
- **Prompt** — a user-selectable template, retrieved via `prompts/get`.
- **Sampling** — a server-initiated request for the host's model to generate a completion (`sampling/createMessage`).
- **Elicitation** — a server-initiated request for structured user input (`elicitation/create`).
- **Extension** — optional protocol surface negotiated under `capabilities.extensions` using reverse-domain keys (e.g. `io.modelcontextprotocol/skills`).
- **SEP** — Specification Enhancement Proposal, MCP's design-change process.

## Rules

- Distinguish host, client, and server strictly — most confusion is between these three.
- When a term has both an MCP-specific meaning and a general meaning (resource, tool), give the MCP meaning first.
- Cite the relevant protocol method names when they clarify (`resources/read`, `tools/call`).
- If asked about a term this glossary does not cover, say so rather than guessing.
