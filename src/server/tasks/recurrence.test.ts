import { describe, expect, it } from "vitest";
import { nextOccurrence, presetToRule } from "./recurrence";

describe("recurrence", () => {
  it("produces the following daily occurrence", () => {
    const start = new Date("2026-10-19T09:00:00Z");
    const next = nextOccurrence(presetToRule("daily", start), start);
    expect(next?.toISOString()).toBe("2026-10-20T09:00:00.000Z");
  });

  it("skips weekends for weekday recurrence", () => {
    const friday = new Date("2026-10-23T09:00:00Z");
    const next = nextOccurrence(presetToRule("weekdays", friday), friday);
    expect(next?.getUTCDay()).toBe(1);
  });

  it("returns null for malformed rules", () => {
    expect(nextOccurrence("not-an-rrule", new Date())).toBeNull();
  });
});
