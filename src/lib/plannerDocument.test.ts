import { describe, expect, it } from "vitest";
import { addTask, deleteTask, emptyDocument, patchTask, rollHorizons, viewTasks, type Horizon } from "./plannerDocument";

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

describe("week rollover", () => {
  // 2026-11-20 is a Friday, 2026-11-23 is a Monday.
  function rollWeek(from: Date, to: Date) {
    let doc = rollHorizons(emptyDocument(), from).document;
    for (const horizon of ["this_week", "next_week", "later"] as Horizon[]) {
      doc = addTask(doc, { title: horizon, horizon, list: "work" }, from);
    }
    const rolled = rollHorizons(doc, to).document;
    return Object.fromEntries(rolled.tasks.map((task) => [task.title, task.horizon]));
  }

  it("keeps week horizons within the same week", () => {
    expect(rollWeek(new Date(2026, 10, 23, 9), new Date(2026, 10, 29, 20))).toEqual({
      this_week: "this_week", next_week: "next_week", later: "later",
    });
  });

  it("moves next week to this week and this week to overdue on Monday", () => {
    expect(rollWeek(new Date(2026, 10, 20, 9), new Date(2026, 10, 23, 0, 5))).toEqual({
      this_week: "overdue", next_week: "this_week", later: "later",
    });
  });

  it("treats Sunday as the end of the week", () => {
    expect(rollWeek(new Date(2026, 10, 21, 9), new Date(2026, 10, 22, 9))).toEqual({
      this_week: "this_week", next_week: "next_week", later: "later",
    });
  });

  it("moves next week to overdue when a whole week was skipped", () => {
    expect(rollWeek(new Date(2026, 10, 20, 9), new Date(2026, 10, 30, 9))).toEqual({
      this_week: "overdue", next_week: "overdue", later: "later",
    });
  });
});

describe("task lists", () => {
  it("deletes a task completely", () => {
    let doc = addTask(emptyDocument(), { title: "Лишняя", horizon: "today", list: "work" });
    doc = addTask(doc, { title: "Нужная", horizon: "today", list: "work" });
    doc = deleteTask(doc, doc.tasks[0].id);
    expect(doc.tasks.map((task) => task.title)).toEqual(["Нужная"]);
  });

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
