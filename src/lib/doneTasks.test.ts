import { describe, expect, it } from "vitest";
import { formatCompletedAt, sortByCompletedAtDesc } from "./doneTasks";

describe("done task order", () => {
  it("puts the most recently closed task first", () => {
    const ordered = sortByCompletedAtDesc([
      { id: "old", completedAt: "2026-11-01T10:00:00.000Z" },
      { id: "new", completedAt: "2026-11-05T12:00:00.000Z" },
      { id: "mid", completedAt: "2026-11-03T08:00:00.000Z" },
    ]);
    expect(ordered.map((task) => task.id)).toEqual(["new", "mid", "old"]);
  });

  it("formats a compact close time", () => {
    const label = formatCompletedAt(new Date(2026, 10, 5, 14, 32), "en-GB");
    expect(label).toMatch(/5/);
    expect(label).toMatch(/Nov/i);
    expect(label).toMatch(/14:32/);
  });
});
