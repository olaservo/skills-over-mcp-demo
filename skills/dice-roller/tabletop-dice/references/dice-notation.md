# Dice Notation Reference

Standard dice notation grammar, as used by this skill.

## Core Form

`NdS` — roll N dice with S sides each. `N` defaults to 1 when omitted (`d20` = `1d20`).

| Notation | Meaning |
|----------|---------|
| `d20` | One twenty-sided die |
| `2d6` | Two six-sided dice, summed |
| `4d8+2` | Four eight-sided dice, summed, plus 2 |
| `3d6-1` | Three six-sided dice, summed, minus 1 |

## Keep / Drop

| Notation | Meaning |
|----------|---------|
| `4d6kh3` | Roll 4d6, keep the highest 3 (classic ability-score roll) |
| `2d20kl1` | Roll 2d20, keep the lowest 1 (disadvantage) |
| `5d10dh1` | Roll 5d10, drop the highest 1 |
| `5d10dl2` | Roll 5d10, drop the lowest 2 |

## Advantage / Disadvantage

- **Advantage**: `2d20kh1` — roll twice, keep the higher.
- **Disadvantage**: `2d20kl1` — roll twice, keep the lower.

## Exploding Dice

`Nd S!` (e.g. `3d6!`) — any die that rolls its maximum value is rerolled and the new result added, repeating while maxima keep appearing. Cap explosions at 10 per die to avoid unbounded loops.

## Percentile

`d100` (or `d%`) — one roll from 1–100. Conventionally rolled as tens die + units die.

## Notation This Skill Does Not Support

Reroll-once (`r`), success-counting pools (`6d10>7`), and fate/fudge dice (`4dF`) are out of scope; explain and offer the closest supported equivalent.
