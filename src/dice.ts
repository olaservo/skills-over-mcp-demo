/**
 * Standard dice notation, rolled.
 *
 * Deliberately a small subset — enough to execute a roll the `tabletop-dice`
 * skill has already told the model how to construct and read. The skill owns
 * notation and interpretation; this owns randomness and arithmetic.
 *
 * For the richer TTRPG treatment (Fallout 2d20 successes/complications, an
 * animated Pip-Boy UI, 3D physics dice) see olaservo/agent-skills-ttrpg-demo.
 *
 * @license Apache-2.0
 */

export interface DieRoll {
  sides: number;
  value: number;
  /** Excluded from the total by a `kh`/`kl` keep rule. */
  dropped?: boolean;
}

export interface RollOutcome {
  notation: string;
  rolls: DieRoll[];
  modifier: number;
  total: number;
  /** Human-readable working, e.g. `[~~5~~, 20] + 3 = 23`. */
  detail: string;
  /** Echoed when the caller supplied a seed, so a roll can be reproduced. */
  seed?: number;
}

/** `<count>d<sides>` with optional `kh`/`kl` and a trailing `+N`/`-N`. */
const NOTATION = /^\s*(\d*)d(\d+)\s*(kh|kl)?\s*([+-]\s*\d+)?\s*$/i;

export const MAX_DICE = 100;
export const MAX_SIDES = 1000;

/**
 * Small deterministic PRNG, so a seeded roll is reproducible across runs and
 * platforms. Same generator as the TTRPG demo's `dice/roll.ts`.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NotationError extends Error {}

/**
 * Rolls `notation`, optionally seeded.
 *
 * @throws {NotationError} when the notation is unsupported or out of bounds.
 */
export function rollNotation(notation: string, seed?: number): RollOutcome {
  const match = NOTATION.exec(notation);
  if (!match) {
    throw new NotationError(
      `Unsupported notation "${notation}". Expected forms like 2d6, d20, 2d20kh, 3d8+2.`,
    );
  }

  const count = match[1] ? Number.parseInt(match[1], 10) : 1;
  const sides = Number.parseInt(match[2], 10);
  const keep = match[3]?.toLowerCase() as "kh" | "kl" | undefined;
  const modifier = match[4] ? Number.parseInt(match[4].replace(/\s+/g, ""), 10) : 0;

  if (count < 1 || count > MAX_DICE) {
    throw new NotationError(`Die count must be between 1 and ${MAX_DICE}, got ${count}.`);
  }
  if (sides < 2 || sides > MAX_SIDES) {
    throw new NotationError(`Die must have 2 to ${MAX_SIDES} sides, got ${sides}.`);
  }

  const rng = seed === undefined ? Math.random : mulberry32(seed);
  const rolls: DieRoll[] = Array.from({ length: count }, () => ({
    sides,
    value: 1 + Math.floor(rng() * sides),
  }));

  if (keep && rolls.length > 1) {
    // Keep one die; drop the rest. Ties keep the first, so the result is
    // stable for a given seed.
    const kept = rolls.reduce((best, r) =>
      keep === "kh" ? (r.value > best.value ? r : best) : (r.value < best.value ? r : best),
    );
    for (const roll of rolls) {
      if (roll !== kept) {
        roll.dropped = true;
      }
    }
  }

  const counted = rolls.filter((r) => !r.dropped);
  const total = counted.reduce((sum, r) => sum + r.value, 0) + modifier;

  const shown = rolls.map((r) => (r.dropped ? `~~${r.value}~~` : `${r.value}`)).join(", ");
  const modText = modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;

  return {
    notation: notation.trim(),
    rolls,
    modifier,
    total,
    detail: `[${shown}]${modText} = ${total}`,
    ...(seed === undefined ? {} : { seed }),
  };
}
