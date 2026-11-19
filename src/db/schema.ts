import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const taskStatuses = [
  "planned",
  "in_progress",
  "blocked",
  "done",
  "archived",
] as const;

export const taskHorizons = [
  "overdue",
  "today",
  "tomorrow",
  "this_week",
  "next_week",
  "later",
] as const;

export const taskLists = ["work", "personal"] as const;

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: taskStatuses }).notNull().default("planned"),
  sortOrder: integer("sort_order").notNull().default(0),
  horizon: text("horizon", { enum: taskHorizons }).notNull().default("today"),
  list: text("list", { enum: taskLists }).notNull().default("work"),
  importance: integer("importance").notNull().default(3),
  energy: integer("energy").notNull().default(3),
  estimateMinutes: integer("estimate_minutes"),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  flagColor: text("flag_color"),
  recurrenceRule: text("recurrence_rule"),
  recurrenceSourceId: text("recurrence_source_id"),
  priorityOverride: real("priority_override"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const timeBlocks = sqliteTable("time_blocks", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const outlookEvents = sqliteTable("outlook_events", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
  isAllDay: integer("is_all_day", { mode: "boolean" }).notNull().default(false),
  showAs: text("show_as").notNull().default("busy"),
  webLink: text("web_link"),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const changeLog = sqliteTable("change_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  topics: text("topics").notNull().default(""),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TimeBlock = typeof timeBlocks.$inferSelect;
export type OutlookEvent = typeof outlookEvents.$inferSelect;
export type Person = typeof people.$inferSelect;
