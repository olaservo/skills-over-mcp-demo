import { describe, expect, it } from "vitest";
import { MAX_DICE, MAX_SIDES, NotationError, mulberry32, rollNotation } from "./dice.js";

describe("rollNotation — parsing", () => {
  it("defaults an omitted count to one die", () => {
    const r = rollNotation("d20", 1);
    expect(r.rolls).toHaveLength(1);
    expect(r.rolls[0]!.sides).toBe(20);
  });

  it("reads count, sides and a positive modifier", () => {
    const r = rollNotation("3d8+2", 1);
    expect(r.rolls).toHaveLength(3);
    expect(r.rolls.every((d) => d.sides === 8)).toBe(true);
    expect(r.modifier).toBe(2);
  });

  it("reads a negative modifier", () => {
    expect(rollNotation("2d6-1", 1).modifier).toBe(-1);
  });

  it("tolerates surrounding and internal whitespace", () => {
    const r = rollNotation("  2d6 + 3 ", 1);
    expect(r.modifier).toBe(3);
    expect(r.rolls).toHaveLength(2);
  });

  it("is case-insensitive for D and keep rules", () => {
    const r = rollNotation("2D20KH", 1);
    expect(r.rolls.filter((d) => d.dropped)).toHaveLength(1);
  });

  it("rejects notation it does not understand", () => {
    for (const bad of ["banana", "", "d", "2d", "6", "2x6", "d20kx"]) {
      expect(() => rollNotation(bad, 1), bad).toThrow(NotationError);
    }
  });

  it("rejects counts and sides outside the supported range", () => {
    expect(() => rollNotation(`${MAX_DICE + 1}d6`, 1)).toThrow(NotationError);
    expect(() => rollNotation(`0d6`, 1)).toThrow(/between 1 and/);
    expect(() => rollNotation(`d${MAX_SIDES + 1}`, 1)).toThrow(NotationError);
    expect(() => rollNotation(`d1`, 1)).toThrow(/2 to/);
  });
});

describe("rollNotation — results", () => {
  it("keeps every die within 1..sides", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const die of rollNotation("5d6", seed).rolls) {
        expect(die.value).toBeGreaterThanOrEqual(1);
        expect(die.value).toBeLessThanOrEqual(6);
      }
    }
  });

  it("totals the kept dice plus the modifier", () => {
    for (let seed = 0; seed < 100; seed++) {
      const r = rollNotation("4d10+3", seed);
      const kept = r.rolls.filter((d) => !d.dropped).reduce((s, d) => s + d.value, 0);
      expect(r.total).toBe(kept + 3);
    }
  });

  it("kh keeps the single highest die and drops the rest", () => {
    for (let seed = 0; seed < 100; seed++) {
      const r = rollNotation("2d20kh", seed);
      const kept = r.rolls.filter((d) => !d.dropped);
      expect(kept).toHaveLength(1);
      expect(kept[0]!.value).toBe(Math.max(...r.rolls.map((d) => d.value)));
      expect(r.total).toBe(kept[0]!.value);
    }
  });

  it("kl keeps the single lowest die", () => {
    for (let seed = 0; seed < 100; seed++) {
      const r = rollNotation("2d20kl", seed);
      const kept = r.rolls.filter((d) => !d.dropped);
      expect(kept).toHaveLength(1);
      expect(kept[0]!.value).toBe(Math.min(...r.rolls.map((d) => d.value)));
    }
  });

  it("ignores a keep rule on a single die", () => {
    const r = rollNotation("1d20kh", 7);
    expect(r.rolls.filter((d) => d.dropped)).toHaveLength(0);
  });

  it("marks dropped dice in the detail string", () => {
    const r = rollNotation("2d20kh+3", 42);
    const dropped = r.rolls.find((d) => d.dropped)!;
    expect(r.detail).toContain(`~~${dropped.value}~~`);
    expect(r.detail).toContain(`= ${r.total}`);
  });

  it("renders a negative modifier as a subtraction", () => {
    expect(rollNotation("2d6-2", 5).detail).toMatch(/ - 2 = /);
  });

  it("omits the modifier from the detail when it is zero", () => {
    expect(rollNotation("2d6", 5).detail).not.toMatch(/[+-]/);
  });
});

describe("rollNotation — seeding", () => {
  it("is reproducible for the same seed and notation", () => {
    const a = rollNotation("4d6+1", 12345);
    const b = rollNotation("4d6+1", 12345);
    expect(b).toEqual(a);
  });

  it("echoes the seed so a roll can be replayed", () => {
    expect(rollNotation("d20", 99).seed).toBe(99);
  });

  it("omits the seed when none was supplied", () => {
    expect(rollNotation("d20").seed).toBeUndefined();
  });

  it("produces different results for different seeds", () => {
    const totals = new Set(
      Array.from({ length: 25 }, (_, seed) => rollNotation("3d20", seed).total),
    );
    // Not a distribution test — just catching a seed that is ignored.
    expect(totals.size).toBeGreaterThan(1);
  });
});

describe("mulberry32", () => {
  it("stays within [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("yields the same sequence for the same seed", () => {
    const a = Array.from({ length: 10 }, mulberry32(3));
    const b = Array.from({ length: 10 }, mulberry32(3));
    expect(b).toEqual(a);
  });
});
