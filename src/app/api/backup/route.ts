import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { changeLog, people, tasks, timeBlocks } from "@/db/schema";
import { createSnapshot } from "@/server/backup/snapshot";
import { setSetting } from "@/server/config";

export const runtime = "nodejs";

const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  tasks: z.array(z.record(z.string(), z.unknown())),
  timeBlocks: z.array(z.record(z.string(), z.unknown())),
  people: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  settings: z.array(z.record(z.string(), z.unknown())).optional().default([]),
});

export async function GET() {
  const { data } = await createSnapshot();
  const body = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="focusflow-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const backup = backupSchema.parse(await request.json());
    const now = new Date();
    const importedTasks = backup.tasks.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      notes: String(row.notes ?? ""),
      status: (row.status === "inbox" ? "planned" : String(row.status ?? "planned")) as typeof tasks.$inferInsert.status,
      sortOrder: Number(row.sortOrder ?? 0),
      horizon: (row.horizon === "none" || row.horizon == null ? "later" : String(row.horizon)) as typeof tasks.$inferInsert.horizon,
      importance: Number(row.importance ?? 3),
      energy: Number(row.energy ?? 3),
      estimateMinutes: row.estimateMinutes == null ? null : Number(row.estimateMinutes),
      dueAt: row.dueAt ? new Date(String(row.dueAt)) : null,
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      recurrenceRule: row.recurrenceRule ? String(row.recurrenceRule) : null,
      recurrenceSourceId: row.recurrenceSourceId ? String(row.recurrenceSourceId) : null,
      priorityOverride: row.priorityOverride == null ? null : Number(row.priorityOverride),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : now,
      updatedAt: row.updatedAt ? new Date(String(row.updatedAt)) : now,
      completedAt: row.completedAt ? new Date(String(row.completedAt)) : null,
    }));
    const importedBlocks = backup.timeBlocks.map((row) => ({
      id: String(row.id),
      taskId: row.taskId ? String(row.taskId) : null,
      title: String(row.title),
      startsAt: new Date(String(row.startsAt)),
      endsAt: new Date(String(row.endsAt)),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : now,
    }));
    const importedPeople = backup.people.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      topics: String(row.topics ?? ""),
      pinned: Boolean(row.pinned),
      sortOrder: Number(row.sortOrder ?? 0),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : now,
      updatedAt: row.updatedAt ? new Date(String(row.updatedAt)) : now,
    }));
    await db.delete(timeBlocks);
    await db.delete(tasks);
    await db.delete(people);
    if (importedTasks.length) await db.insert(tasks).values(importedTasks);
    if (importedBlocks.length) await db.insert(timeBlocks).values(importedBlocks);
    if (importedPeople.length) await db.insert(people).values(importedPeople);
    for (const row of backup.settings) {
      if (row.key === "scratchpad") await setSetting("scratchpad", String(row.value ?? ""));
    }
    await db.insert(changeLog).values({
      id: crypto.randomUUID(),
      entityType: "backup",
      entityId: "restore",
      action: "restore",
      payload: { tasks: importedTasks.length, blocks: importedBlocks.length, people: importedPeople.length },
      createdAt: now,
    });
    return NextResponse.json({ tasks: importedTasks.length, timeBlocks: importedBlocks.length, people: importedPeople.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t restore the backup." },
      { status: 400 },
    );
  }
}
