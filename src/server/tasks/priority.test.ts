import { describe, expect, it } from "vitest";
import { calculatePriority } from "./priority";

const base = {
  status: "planned" as const,
  importance: 3,
  energy: 3,
  estimateMinutes: 30,
  dueAt: null,
  priorityOverride: null,
};

describe("calculatePriority", () => {
  it("raises overdue important work above unscheduled work", () => {
    const now = new Date("2026-10-19T10:00:00Z");
    const overdue = calculatePriority(
      { ...base, importance: 5, dueAt: new Date("2026-10-18T10:00:00Z") },
      now,
    );
    const unscheduled = calculatePriority(base, now);
    expect(overdue.score).toBeGreaterThan(unscheduled.score);
    expect(overdue.bucket).toBe("now");
    expect(overdue.reasons).toContain("Overdue");
  });

  it("honors an explicit override and explains it", () => {
    expect(calculatePriority({ ...base, priorityOverride: 12 }).reasons).toEqual([
      "Priority was set manually",
    ]);
  });

  it("deprioritizes blocked work", () => {
    const result = calculatePriority({ ...base, status: "blocked" });
    expect(result.score).toBeLessThan(20);
  });
});
