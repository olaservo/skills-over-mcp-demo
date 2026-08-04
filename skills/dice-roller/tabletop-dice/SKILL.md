---
name: tabletop-dice
description: Roll dice for tabletop games using standard dice notation (2d6+3, d20 with advantage, exploding dice). Use when the user asks to roll dice, resolve a game check, or interpret dice notation.
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# Tabletop Dice

Roll dice fairly and transparently for tabletop games.

## When to Use

- The user asks to roll dice ("roll 2d6+3", "roll for initiative")
- The user asks what a piece of dice notation means
- A game rule requires a random check

## Process

1. **Parse the notation** — see `references/dice-notation.md` for the full grammar. If the notation is ambiguous, ask.
2. **Roll each die individually** — generate one random integer per die, never a single aggregate. Show every raw die result.
3. **Apply modifiers** — add flat modifiers, apply keep/drop rules (`kh`/`kl`), resolve advantage/disadvantage as roll-twice-keep-one.
4. **Report** — show the individual dice, the math, and the final total on its own line.

## Output Format

```
Rolling 2d6+3: [4] [6] + 3 = 13
```

For advantage/disadvantage, show both rolls and mark the kept one:

```
Rolling d20 with advantage: [17] ~~[9]~~ → 17
```

## Rules

- Never invent a result without showing the individual dice.
- If a roll's outcome matters for a rule (crit on natural 20, fumble on natural 1), call it out explicitly.
- For more than 20 dice, offer to summarize (total plus distribution) instead of listing every die.
