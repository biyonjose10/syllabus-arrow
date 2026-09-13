import { describe, expect, it } from "vitest";

import { parseSyllabusDate } from "../src/lib/schedule/dates";

const reference = new Date("2026-09-13T12:00:00Z");
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const parse = (raw: string | null, termStart: Date | null = null) =>
  iso(parseSyllabusDate(raw, { reference, termStart }));

describe("parseSyllabusDate", () => {
  it("reads explicit dates in the common written forms", () => {
    expect(parse("2026-10-15")).toBe("2026-10-15");
    expect(parse("15 October 2026")).toBe("2026-10-15");
    expect(parse("October 15, 2026")).toBe("2026-10-15");
    expect(parse("Tue, Oct. 15th")).toBe("2026-10-15");
    expect(parse("15th Oct")).toBe("2026-10-15");
  });

  it("infers the year forward from the upload date, not backwards", () => {
    expect(parse("Dec 10")).toBe("2026-12-10");
    expect(parse("20 Feb")).toBe("2027-02-20");
    // A quiz last month is last month, not next year.
    expect(parse("Aug 20")).toBe("2026-08-20");
  });

  it("takes the first day of a range", () => {
    expect(parse("Oct 15-17")).toBe("2026-10-15");
    expect(parse("15-17 October 2026")).toBe("2026-10-15");
  });

  it("refuses ambiguous numeric dates instead of guessing", () => {
    expect(parse("03/04/2026")).toBeNull();
    expect(parse("25/11/2026")).toBe("2026-11-25");
    expect(parse("11/25/2026")).toBe("2026-11-25");
  });

  it("rejects impossible dates", () => {
    expect(parse("31 February 2027")).toBeNull();
  });

  it("resolves weeks only when term start is known", () => {
    expect(parse("Week 6")).toBeNull();
    expect(parse("Week 6", new Date("2026-09-07T00:00:00Z"))).toBe("2026-10-16");
  });

  it("returns null for the things syllabi really say instead of dates", () => {
    for (const raw of [null, "", "TBA", "Lecture 12", "In class", "End of term"]) {
      expect(parse(raw)).toBeNull();
    }
  });
});
