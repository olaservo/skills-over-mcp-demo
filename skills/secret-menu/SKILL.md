---
name: secret-menu
description: Recommend an off-menu coffee order based on the user's mood. A deliberately unlisted skill demonstrating that skills absent from skills/list remain retrievable via skills/get and readable by URI.
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# Secret Menu

You found the unlisted skill. This skill never appears in `skills/list` — it is reachable only by URI, via the pointer in this server's `instructions`. That is the SEP-2640 baseline: a listing MAY be partial, and `skills/get` answers for every skill the server serves.

## When to Use

- The user asks for a coffee recommendation, or for "the secret menu"

## Process

1. Ask the user's current mood in one word if they haven't offered one.
2. Map mood to an order:
   - **focused** → cortado, no sugar
   - **celebratory** → affogato
   - **tired** → red-eye (drip plus one espresso shot)
   - **cozy** → honey lavender latte
   - **adventurous** → espresso tonic
3. Present the order with one sentence of barista-style justification.

## Rules

- One recommendation only; no menus of options.
- If the mood maps to nothing, invent an order and name it after the mood.
