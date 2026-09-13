import { describe, expect, it } from "vitest";

import { BKT, bktReplay, bktUpdate, MASTERED, masteryBand } from "../src/lib/mastery/bkt";

describe("Bayesian Knowledge Tracing", () => {
  it("rises on a correct answer and falls on a wrong one", () => {
    const p = 0.5;
    expect(bktUpdate(p, true)).toBeGreaterThan(p);
    expect(bktUpdate(p, false)).toBeLessThan(p);
  });

  it("reaches mastery after a run of correct answers, not after one", () => {
    expect(bktReplay([true])).toBeLessThan(MASTERED);
    expect(bktReplay([true, true, true, true])).toBeGreaterThanOrEqual(MASTERED);
  });

  it("does not let a single slip erase a strong run", () => {
    const strong = bktReplay([true, true, true, true, true]);
    const afterSlip = bktUpdate(strong, false);
    expect(afterSlip).toBeLessThan(strong);
    expect(afterSlip).toBeGreaterThan(0.5);
  });

  it("stays low when answers are consistently wrong", () => {
    expect(bktReplay([false, false, false])).toBeLessThan(0.4);
  });

  it("is order-sensitive in the way learning is: late success counts more", () => {
    expect(bktReplay([false, false, true, true])).toBeGreaterThan(bktReplay([true, true, false, false]));
  });

  it("always stays a probability", () => {
    let p: number = BKT.pInit;
    for (let i = 0; i < 200; i++) p = bktUpdate(p, i % 7 !== 0);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it("calls a concept with no attempts unseen, never 0%", () => {
    expect(masteryBand(null, 0)).toBe("unseen");
    expect(masteryBand(0.2, 0)).toBe("unseen");
    expect(masteryBand(0.9, 4)).toBe("mastered");
    expect(masteryBand(0.2, 3)).toBe("struggling");
    expect(masteryBand(0.6, 2)).toBe("learning");
  });
});
