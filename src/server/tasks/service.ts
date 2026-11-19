import { and, asc, desc, eq, min, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { changeLog, settings, taskHorizons, taskLists, tasks, type Task } from "@/db/schema";
import { taskFlagColors } from "@/lib/taskFlags";
import { calculatePriority } from "./priority";
import { nextOccurrence, presetToRule } from "./recurrence";

const dateInput = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  });

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  notes: z.string().max(10_000).optional().default(""),
  status: z
    .enum(["planned", "in_progress", "blocked", "done", "archived"])
    .optional()
    .default("planned"),
  horizon: z.enum(taskHorizons).optional().default("today"),
  list: z.enum(taskLists).optional().default("work"),
  importance: z.coerce.number().int().min(1).max(5).optional().default(3),
  energy: z.coerce.number().int().min(1).max(5).optional().default(3),
  estimateMinutes: z.coerce.number().int().positive().max(10_080).nullable().optional(),
  dueAt: dateInput,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  recurrence: z.enum(["daily", "weekdays", "weekly", "monthly"]).nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  priorityOverride: z.coerce.number().min(0).max(200).nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  notes: z.string().max(10_000).optional(),
  status: z.enum(["planned", "in_progress", "blocked", "done", "archived"]).optional(),
  horizon: z.enum(taskHorizons).optional(),
  importance: z.coerce.number().int().min(1).max(5).optional(),
  energy: z.coerce.number().int().min(1).max(5).optional(),
  estimateMinutes: z.coerce.number().int().positive().max(10_080).nullable().optional(),
  dueAt: dateInput,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  recurrence: z.enum(["daily", "weekdays", "weekly", "monthly"]).nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  flagColor: z.enum(taskFlagColors).nullable().optional(),
  priorityOverride: z.coerce.number().min(0).max(200).nullable().optional(),
  completedAt: dateInput,
});

export type TaskWithPriority = Task & {
  priority: ReturnType<typeof calculatePriority>;
};

export async function listTasks(includeArchived = false): Promise<TaskWithPriority[]> {
  await rollTaskHorizons();
  const rows = includeArchived
    ? await db.select().from(tasks).orderBy(asc(tasks.sortOrder), desc(tasks.createdAt))
    : await db
        .select()
        .from(tasks)
        .where(ne(tasks.status, "archived"))
        .orderBy(asc(tasks.sortOrder), desc(tasks.createdAt));
  return rows
    .map((task) => ({ ...task, priority: calculatePriority(task) }))
    .sort(compareTasks);
}

const horizonRank: Record<(typeof taskHorizons)[number], number> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
  this_week: 3,
  next_week: 4,
  later: 5,
};

const HORIZON_ROLLOVER_KEY = "horizonRolloverDate";

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetweenLocalDates(fromKey: string, toKey: string): number {
  const from = parseLocalDateKey(fromKey);
  const to = parseLocalDateKey(toKey);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function parseLocalDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export async function rollTaskHorizons(now = new Date()): Promise<number> {
  const today = localDateKey(now);
  const [stored] = await db.select().from(settings).where(eq(settings.key, HORIZON_ROLLOVER_KEY)).limit(1);
  if (!stored) {
    await db.insert(settings).values({ key: HORIZON_ROLLOVER_KEY, value: today, updatedAt: now });
    return 0;
  }
  const days = daysBetweenLocalDates(stored.value, today);
  if (days <= 0) return 0;

  const open = notInArray(tasks.status, ["done", "archived"]);
  await db
    .update(tasks)
    .set({ horizon: "overdue", updatedAt: now })
    .where(and(eq(tasks.horizon, "today"), open));
  await db
    .update(tasks)
    .set({ horizon: days === 1 ? "today" : "overdue", updatedAt: now })
    .where(and(eq(tasks.horizon, "tomorrow"), open));
  await db
    .insert(settings)
    .values({ key: HORIZON_ROLLOVER_KEY, value: today, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: today, updatedAt: now },
    });
  return days;
}

function compareTasks(a: TaskWithPriority, b: TaskWithPriority) {
  return (
    (horizonRank[a.horizon] ?? 9) - (horizonRank[b.horizon] ?? 9) ||
    a.sortOrder - b.sortOrder ||
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function reorderTasks(
  ids: string[],
  change?: { movedId: string; horizon: (typeof taskHorizons)[number] },
): Promise<void> {
  if (change) {
    await db
      .update(tasks)
      .set({ horizon: z.enum(taskHorizons).parse(change.horizon), updatedAt: new Date() })
      .where(eq(tasks.id, z.string().uuid().parse(change.movedId)));
  }
  const orderedIds = z.array(z.string().uuid()).min(1).parse(ids);
  const existing = await db.select({ id: tasks.id, sortOrder: tasks.sortOrder }).from(tasks);
  const known = new Set(existing.map((task) => task.id));
  const ordered = orderedIds.filter((id) => known.has(id));
  const positions = existing
    .filter((task) => ordered.includes(task.id))
    .map((task) => task.sortOrder)
    .sort((a, b) => a - b);
  const uniquePositions = [...new Set(positions)];
  const slots =
    uniquePositions.length === ordered.length
      ? uniquePositions
      : ordered.map((_, index) => (positions[0] ?? 0) + index * 10);
  for (const [index, id] of ordered.entries()) {
    await db
      .update(tasks)
      .set({ sortOrder: slots[index], updatedAt: new Date() })
      .where(eq(tasks.id, id));
  }
}

export async function createTask(
  input: z.input<typeof createTaskSchema>,
  options: { allowDuplicate?: boolean } = {},
): Promise<TaskWithPriority> {
  const data = createTaskSchema.parse(input);
  if (!options.allowDuplicate) {
    const duplicates = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.title, data.title), eq(tasks.list, data.list), ne(tasks.status, "done")))
      .limit(1);
    if (duplicates[0]) {
      throw new Error("A similar unfinished task already exists.");
    }
  }
  const now = new Date();
  const id = crypto.randomUUID();
  const recurrenceRule =
    data.recurrenceRule ??
    (data.recurrence ? presetToRule(data.recurrence, data.dueAt ?? now) : null);
  const [task] = await db
    .insert(tasks)
    .values({
      id,
      title: data.title,
      notes: data.notes,
      status: data.status,
      horizon: data.horizon,
      list: data.list,
      importance: data.importance,
      energy: data.energy,
      estimateMinutes: data.estimateMinutes ?? null,
      dueAt: data.dueAt,
      tags: data.tags,
      recurrenceRule,
      sortOrder: await nextSortOrder(),
      priorityOverride: data.priorityOverride ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: data.status === "done" ? now : null,
    })
    .returning();
  await logChange(task.id, "create", { title: task.title });
  return { ...task, priority: calculatePriority(task) };
}

export async function updateTask(
  id: string,
  input: z.input<typeof updateTaskSchema>,
): Promise<TaskWithPriority> {
  const data = updateTaskSchema.parse(input);
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existing) throw new Error("Task not found.");

  const status = data.status ?? existing.status;
  const recurrenceRule =
    data.recurrence !== undefined
      ? data.recurrence
        ? presetToRule(data.recurrence, data.dueAt ?? existing.dueAt ?? new Date())
        : null
      : data.recurrenceRule === undefined
        ? existing.recurrenceRule
        : data.recurrenceRule;
  const horizonChanged = data.horizon !== undefined && data.horizon !== existing.horizon;
  const updates = {
    ...data,
    recurrence: undefined,
    recurrenceRule,
    sortOrder: horizonChanged ? await nextSortOrder() : existing.sortOrder,
    updatedAt: new Date(),
    completedAt:
      status === "done" ? (existing.completedAt ?? new Date()) : (data.completedAt ?? null),
  };
  const [task] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning();

  if (status === "done" && existing.status !== "done" && task.recurrenceRule) {
    await createNextRecurringTask(task);
  }
  await logChange(id, "update", data as Record<string, unknown>);
  return { ...task, priority: calculatePriority(task) };
}

export async function archiveTask(id: string): Promise<void> {
  const result = await db
    .update(tasks)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id });
  if (!result[0]) throw new Error("Task not found.");
  await logChange(id, "archive");
}

async function nextSortOrder(): Promise<number> {
  const [row] = await db.select({ value: min(tasks.sortOrder) }).from(tasks);
  return (row?.value ?? 10) - 10;
}

async function createNextRecurringTask(task: Task): Promise<void> {
  const anchor = task.dueAt ?? task.completedAt ?? new Date();
  const dueAt = nextOccurrence(task.recurrenceRule!, anchor);
  if (!dueAt) return;
  await createTask(
    {
      title: task.title,
      notes: task.notes,
      status: "planned",
      horizon: task.horizon,
      list: task.list,
      importance: task.importance,
      energy: task.energy,
      estimateMinutes: task.estimateMinutes,
      dueAt,
      tags: task.tags,
      recurrenceRule: task.recurrenceRule,
    },
    { allowDuplicate: true },
  );
}

async function logChange(
  entityId: string,
  action: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await db.insert(changeLog).values({
    id: crypto.randomUUID(),
    entityType: "task",
    entityId,
    action,
    payload,
    createdAt: new Date(),
  });
}
