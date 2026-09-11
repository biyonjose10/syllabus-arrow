import { describe, expect, it } from "vitest";

import {
  assertFeature,
  assertWithinLimit,
  checkLimit,
  FeatureLockedError,
  LimitExceededError,
  PLANS,
} from "../src/lib/plans";

describe("plan limits", () => {
  it("Free allows the first course and blocks the second", () => {
    expect(checkLimit("free", "courses", 0).allowed).toBe(true);
    expect(checkLimit("free", "courses", 1).allowed).toBe(false);
    expect(() => assertWithinLimit("free", "courses", 1)).toThrow(LimitExceededError);
  });

  it("Free allows document 10 and blocks document 11", () => {
    expect(() => assertWithinLimit("free", "documents", 9)).not.toThrow();
    expect(() => assertWithinLimit("free", "documents", 10)).toThrow(LimitExceededError);
  });

  it("the thrown error carries what the upgrade dialog needs", () => {
    try {
      assertWithinLimit("free", "courses", 1);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LimitExceededError);
      expect(error).toMatchObject({ plan: "free", limit: "courses", used: 1, max: 1 });
    }
  });

  it("Pro has no caps", () => {
    expect(checkLimit("pro", "courses", 10_000)).toEqual({ allowed: true, used: 10_000, max: null });
    expect(() => assertWithinLimit("pro", "checksPerDay", 1_000_000)).not.toThrow();
  });

  it("past papers are a Pro feature", () => {
    expect(() => assertFeature("free", "pastPapers")).toThrow(FeatureLockedError);
    expect(() => assertFeature("pro", "pastPapers")).not.toThrow();
  });

  it("the pricing page states the numbers the code enforces", () => {
    expect(PLANS.free.limits).toEqual({ courses: 1, documents: 10, checksPerDay: 20 });
    expect(PLANS.pro.priceMonthlyUsd).toBe(8);
  });
});
