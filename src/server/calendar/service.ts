import { and, asc, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { outlookEvents, timeBlocks } from "@/db/schema";

export const timeBlockSchema = z
  .object({
    taskId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(240),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: "The end must be later than the start.",
  });

export async function listCalendar(from: Date, to: Date) {
  const [blocks, events] = await Promise.all([
    db
      .select()
      .from(timeBlocks)
      .where(and(lt(timeBlocks.startsAt, to), gt(timeBlocks.endsAt, from)))
      .orderBy(asc(timeBlocks.startsAt)),
    db
      .select()
      .from(outlookEvents)
      .where(and(lt(outlookEvents.startsAt, to), gt(outlookEvents.endsAt, from)))
      .orderBy(asc(outlookEvents.startsAt)),
  ]);
  return { blocks, outlookEvents: events };
}

export async function createTimeBlock(input: unknown) {
  const data = timeBlockSchema.parse(input);
  const conflicts = await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        lt(timeBlocks.startsAt, data.endsAt),
        gt(timeBlocks.endsAt, data.startsAt),
      ),
    );
  const [block] = await db
    .insert(timeBlocks)
    .values({
      id: crypto.randomUUID(),
      taskId: data.taskId ?? null,
      title: data.title,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      createdAt: new Date(),
    })
    .returning();
  return { block, conflicts };
}

export async function deleteTimeBlock(id: string) {
  await db.delete(timeBlocks).where(eq(timeBlocks.id, id));
}
