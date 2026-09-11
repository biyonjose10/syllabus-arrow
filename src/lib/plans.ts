/**
 * The plan table — the single source of truth for what each tier allows.
 *
 * The pricing page, the usage meter, the upgrade dialog and every server-side
 * limit check all read from here, so the page can never promise something the
 * code does not enforce.
 *
 * Pure on purpose: callers pass in the current usage count (the tenancy layer
 * counts it). That keeps this file free of database and model imports, and
 * testable without either.
 */

export type PlanId = "free" | "pro";

/** `null` means unlimited. */
type Limits = {
  courses: number | null;
  documents: number | null;
  checksPerDay: number | null;
};

type Plan = {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  limits: Limits;
  features: {
    /** Past papers map exam questions onto the graph → exam weight per concept. */
    pastPapers: boolean;
  };
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    tagline: "One course, planned properly.",
    limits: { courses: 1, documents: 10, checksPerDay: 20 },
    features: { pastPapers: false },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 8,
    tagline: "Every course, weighted by what is actually on the exam.",
    limits: { courses: null, documents: null, checksPerDay: null },
    features: { pastPapers: true },
  },
};

export type LimitKey = keyof Limits;

export type LimitCheck = {
  allowed: boolean;
  used: number;
  /** `null` when the plan has no cap. */
  max: number | null;
};

/** Would one more of `key` fit within the plan? */
export function checkLimit(plan: PlanId, key: LimitKey, used: number): LimitCheck {
  const max = PLANS[plan].limits[key];
  return { allowed: max === null || used < max, used, max };
}

export class LimitExceededError extends Error {
  constructor(
    readonly plan: PlanId,
    readonly limit: LimitKey,
    readonly used: number,
    readonly max: number,
  ) {
    super(`${PLANS[plan].name} plan allows ${max} ${limit}; ${used} already used.`);
    this.name = "LimitExceededError";
  }
}

export class FeatureLockedError extends Error {
  constructor(
    readonly plan: PlanId,
    readonly feature: keyof Plan["features"],
  ) {
    super(`${feature} is not included in the ${PLANS[plan].name} plan.`);
    this.name = "FeatureLockedError";
  }
}

/** Throws before the work starts — never after the model has been paid for. */
export function assertWithinLimit(plan: PlanId, key: LimitKey, used: number): void {
  const { allowed, max } = checkLimit(plan, key, used);
  if (!allowed) throw new LimitExceededError(plan, key, used, max!);
}

export function assertFeature(plan: PlanId, feature: keyof Plan["features"]): void {
  if (!PLANS[plan].features[feature]) throw new FeatureLockedError(plan, feature);
}
