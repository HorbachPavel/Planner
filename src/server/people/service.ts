import { asc, desc, eq, min } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { people } from "@/db/schema";

const createPersonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  topics: z.string().max(20_000).optional().default(""),
});

const updatePersonSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  topics: z.string().max(20_000).optional(),
  pinned: z.boolean().optional(),
});

export async function listPeople() {
  return db.select().from(people).orderBy(desc(people.pinned), asc(people.sortOrder), asc(people.name));
}

export async function createPerson(input: unknown) {
  const data = createPersonSchema.parse(input);
  const now = new Date();
  const [least] = await db.select({ value: min(people.sortOrder) }).from(people);
  const [person] = await db
    .insert(people)
    .values({
      id: crypto.randomUUID(),
      ...data,
      pinned: false,
      sortOrder: (least?.value ?? 10) - 10,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return person;
}

export async function reorderPeople(
  ids: string[],
  change?: { movedId: string; pinned: boolean },
) {
  if (change) {
    await db
      .update(people)
      .set({ pinned: z.boolean().parse(change.pinned), updatedAt: new Date() })
      .where(eq(people.id, z.string().uuid().parse(change.movedId)));
  }
  const orderedIds = z.array(z.string().uuid()).min(1).parse(ids);
  const existing = await db.select({ id: people.id, sortOrder: people.sortOrder }).from(people);
  const known = new Set(existing.map((person) => person.id));
  const ordered = orderedIds.filter((id) => known.has(id));
  const positions = existing
    .filter((person) => ordered.includes(person.id))
    .map((person) => person.sortOrder)
    .sort((a, b) => a - b);
  const uniquePositions = [...new Set(positions)];
  const slots =
    uniquePositions.length === ordered.length
      ? uniquePositions
      : ordered.map((_, index) => (positions[0] ?? 0) + index * 10);
  for (const [index, id] of ordered.entries()) {
    await db.update(people).set({ sortOrder: slots[index], updatedAt: new Date() }).where(eq(people.id, id));
  }
}

export async function updatePerson(id: string, input: unknown) {
  const data = updatePersonSchema.parse(input);
  const [least] = data.pinned ? await db.select({ value: min(people.sortOrder) }).from(people) : [];
  const [person] = await db
    .update(people)
    .set({
      ...data,
      ...(data.pinned ? { sortOrder: (least?.value ?? 10) - 10 } : {}),
      updatedAt: new Date(),
    })
    .where(eq(people.id, id))
    .returning();
  if (!person) throw new Error("Person not found.");
  return person;
}

export async function deletePerson(id: string) {
  await db.delete(people).where(eq(people.id, id));
}
