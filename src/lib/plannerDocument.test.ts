import { describe, expect, it } from "vitest";
import { backupFileName, expiredBackupPaths, retainedBackupNames } from "./backups";
import { addTask, emptyDocument, patchTask, rollHorizons, viewTasks } from "./plannerDocument";

describe("horizon rollover", () => {
  it("leaves tasks in place the first time a day is recorded", () => {
    const created = addTask(emptyDocument(), { title: "Завтра", horizon: "tomorrow", list: "work" }, new Date(2026, 9, 19, 22));
    const rolled = rollHorizons(created, new Date(2026, 9, 19, 22));
    expect(rolled.document.tasks[0].horizon).toBe("tomorrow");
    expect(rolled.document.horizonRolloverDate).toBe("2026-10-19");
  });

  it("moves today to overdue and tomorrow to today after one day", () => {
    let doc = rollHorizons(emptyDocument(), new Date(2026, 9, 19, 22)).document;
    doc = addTask(doc, { title: "Сегодня", horizon: "today", list: "work" }, new Date(2026, 9, 19, 22));
    doc = addTask(doc, { title: "Завтра", horizon: "tomorrow", list: "work" }, new Date(2026, 9, 19, 22));
    doc = addTask(doc, { title: "Готово", horizon: "today", list: "work" }, new Date(2026, 9, 19, 22));
    doc = patchTask(doc, doc.tasks[2].id, { status: "done" }, new Date(2026, 9, 19, 23));
    const rolled = rollHorizons(doc, new Date(2026, 9, 20, 0, 5));
    const horizons = Object.fromEntries(rolled.document.tasks.map((task) => [task.title, task.horizon]));
    expect(horizons["Сегодня"]).toBe("overdue");
    expect(horizons["Завтра"]).toBe("today");
    expect(horizons["Готово"]).toBe("today");
  });
});

describe("task lists", () => {
  it("allows the same title in work and personal lists", () => {
    let doc = addTask(emptyDocument(), { title: "Купить молоко", horizon: "today", list: "work" });
    doc = addTask(doc, { title: "Купить молоко", horizon: "today", list: "personal" });
    expect(() => addTask(doc, { title: "Купить молоко", horizon: "today", list: "personal" })).toThrow("already exists");
    expect(viewTasks(doc).filter((task) => task.list === "personal")).toHaveLength(1);
  });

  it("puts a new task and a changed horizon first in the group", () => {
    let doc = addTask(emptyDocument(), { title: "Первая", horizon: "today", list: "work" });
    doc = addTask(doc, { title: "Вторая", horizon: "today", list: "work" });
    expect(viewTasks(doc).map((task) => task.title)).toEqual(["Вторая", "Первая"]);
    doc = patchTask(doc, doc.tasks[0].id, { horizon: "later" });
    doc = patchTask(doc, doc.tasks[0].id, { horizon: "today" });
    expect(viewTasks(doc).filter((task) => task.horizon === "today").map((task) => task.title)[0]).toBe("Первая");
  });
});

describe("backup retention", () => {
  const now = new Date(2026, 10, 15, 18, 0);

  it("names the fresh backup by the current half of the day", () => {
    expect(backupFileName(now)).toBe("2026-11-15-pm.json");
    expect(backupFileName(new Date(2026, 10, 15, 9))).toBe("2026-11-15-am.json");
  });

  it("keeps today and yesterday, and removes older copies", () => {
    expect(retainedBackupNames(now)).toEqual(new Set([
      "2026-11-15-am.json",
      "2026-11-15-pm.json",
      "2026-11-14-am.json",
      "2026-11-14-pm.json",
    ]));
    expect(expiredBackupPaths([
      "data/backups/2026-11-15-pm.json",
      "data/backups/2026-11-13-am.json",
      "data/backups/notes.txt",
    ], now)).toEqual(["data/backups/2026-11-13-am.json"]);
  });
});
