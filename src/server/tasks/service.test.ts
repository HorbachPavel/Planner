import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { changeLog, settings, tasks, timeBlocks } from "@/db/schema";
import { nextTaskFlagColor, taskFlagColors } from "@/lib/taskFlags";
import { createTimeBlock } from "@/server/calendar/service";
import { createTask, listTasks, reorderTasks, rollTaskHorizons, updateTask } from "./service";

beforeEach(async () => {
  await db.delete(timeBlocks);
  await db.delete(changeLog);
  await db.delete(tasks);
});

describe("task workflow", () => {
  it("creates, updates and lists a task", async () => {
    const created = await createTask({ title: "Подготовить отчёт", importance: 5 });
    await updateTask(created.id, { status: "in_progress" });
    const all = await listTasks();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("in_progress");
    expect(created.status).toBe("planned");
    expect(created.horizon).toBe("today");
    const scheduled = await updateTask(created.id, { horizon: "today" });
    expect(scheduled.horizon).toBe("today");
    expect(all[0].priority.reasons).toContain("Already started");
  });

  it("keeps the existing deadline when only the status or text changes", async () => {
    const created = await createTask({ title: "Подготовить черновик", horizon: "tomorrow" });
    const updated = await updateTask(created.id, { status: "blocked", notes: "Жду ответ" });
    expect(updated.horizon).toBe("tomorrow");
    expect(updated.status).toBe("blocked");
    expect(updated.notes).toBe("Жду ответ");
  });

  it("protects against duplicate open tasks", async () => {
    await createTask({ title: "Позвонить коллеге" });
    await expect(createTask({ title: "Позвонить коллеге" })).rejects.toThrow("already exists");
  });

  it("creates the next occurrence when a recurring task is completed", async () => {
    const task = await createTask({
      title: "Ежедневный обзор",
      dueAt: new Date("2026-10-19T08:00:00Z"),
      recurrence: "daily",
    });
    await updateTask(task.id, { status: "done" });
    const all = await listTasks();
    expect(all.some((item) => item.id !== task.id && item.title === task.title)).toBe(true);
  });
});

describe("manual order", () => {
  it("places a new task above existing ones and keeps a drag order", async () => {
    const first = await createTask({ title: "Первая" });
    const second = await createTask({ title: "Вторая" });
    expect((await listTasks()).map((task) => task.id)).toEqual([second.id, first.id]);

    await reorderTasks([first.id, second.id]);
    expect((await listTasks()).map((task) => task.id)).toEqual([first.id, second.id]);
  });

  it("groups tasks by deadline and puts a changed deadline at the top of its group", async () => {
    const today = await createTask({ title: "Сегодня", horizon: "today" });
    const later = await createTask({ title: "Когда-нибудь", horizon: "later" });
    expect((await listTasks()).map((task) => task.id)).toEqual([today.id, later.id]);

    await updateTask(later.id, { horizon: "today" });
    expect((await listTasks()).map((task) => task.id)).toEqual([later.id, today.id]);
  });
});

describe("task flags", () => {
  it("stores and clears a flag color", async () => {
    const task = await createTask({ title: "Срочный звонок" });
    const flagged = await updateTask(task.id, { flagColor: taskFlagColors[0] });
    expect(flagged.flagColor).toBe(taskFlagColors[0]);
    const cleared = await updateTask(task.id, { flagColor: null });
    expect(cleared.flagColor).toBeNull();
  });

  it("picks a different color for the next flag", () => {
    expect(nextTaskFlagColor([taskFlagColors[0]])).toBe(taskFlagColors[1]);
    expect(nextTaskFlagColor([...taskFlagColors])).toBe(taskFlagColors[0]);
  });
});

describe("horizon rollover", () => {
  beforeEach(async () => {
    await db.delete(settings);
  });

  it("does not rewrite horizons the first time the day is recorded", async () => {
    const task = await createTask({ title: "Завтра", horizon: "tomorrow" });
    await rollTaskHorizons(new Date(2026, 9, 19, 22, 0, 0));
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row.horizon).toBe("tomorrow");
  });

  it("moves today to overdue and tomorrow to today after midnight", async () => {
    await rollTaskHorizons(new Date(2026, 9, 19, 22, 0, 0));
    const todayTask = await createTask({ title: "Сегодня", horizon: "today" });
    const tomorrowTask = await createTask({ title: "Завтра", horizon: "tomorrow" });
    const weekTask = await createTask({ title: "Неделя", horizon: "this_week" });
    const doneTask = await createTask({ title: "Готово", horizon: "today", status: "done" });

    await rollTaskHorizons(new Date(2026, 9, 20, 0, 5, 0));
    const rows = Object.fromEntries(
      (await db.select().from(tasks)).map((task) => [task.id, task.horizon]),
    );
    expect(rows[todayTask.id]).toBe("overdue");
    expect(rows[tomorrowTask.id]).toBe("today");
    expect(rows[weekTask.id]).toBe("this_week");
    expect(rows[doneTask.id]).toBe("today");
  });

  it("moves both today and tomorrow to overdue after a skipped day", async () => {
    await rollTaskHorizons(new Date(2026, 9, 19, 22, 0, 0));
    const todayTask = await createTask({ title: "Сегодня", horizon: "today" });
    const tomorrowTask = await createTask({ title: "Завтра", horizon: "tomorrow" });

    await rollTaskHorizons(new Date(2026, 9, 21, 9, 0, 0));
    const rows = Object.fromEntries(
      (await db.select().from(tasks)).map((task) => [task.id, task.horizon]),
    );
    expect(rows[todayTask.id]).toBe("overdue");
    expect(rows[tomorrowTask.id]).toBe("overdue");
  });
});

describe("calendar", () => {
  it("reports overlapping time blocks", async () => {
    await createTimeBlock({
      title: "Первый блок",
      startsAt: "2026-10-19T10:00:00Z",
      endsAt: "2026-10-19T11:00:00Z",
    });
    const result = await createTimeBlock({
      title: "Пересечение",
      startsAt: "2026-10-19T10:30:00Z",
      endsAt: "2026-10-19T11:30:00Z",
    });
    expect(result.conflicts).toHaveLength(1);
  });
});
