import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { people } from "@/db/schema";
import { createPerson, deletePerson, listPeople, reorderPeople, updatePerson } from "./service";

beforeEach(async () => {
  await db.delete(people);
});

describe("people discussion list", () => {
  it("creates and edits discussion topics", async () => {
    const person = await createPerson({ name: "Анна" });
    await updatePerson(person.id, { topics: "Спросить про запуск\nОбсудить сроки" });
    const all = await listPeople();
    expect(all).toHaveLength(1);
    expect(all[0].topics).toContain("запуск");
  });

  it("keeps pinned people above others and preserves a manual order", async () => {
    const anna = await createPerson({ name: "Анна" });
    const ivan = await createPerson({ name: "Иван" });
    await updatePerson(anna.id, { pinned: true });
    expect((await listPeople()).map((person) => person.id)).toEqual([anna.id, ivan.id]);

    await reorderPeople([ivan.id, anna.id], { movedId: ivan.id, pinned: true });
    expect((await listPeople()).map((person) => person.id)).toEqual([ivan.id, anna.id]);
  });

  it("deletes a person", async () => {
    const person = await createPerson({ name: "Иван", topics: "Обратная связь" });
    await deletePerson(person.id);
    expect(await listPeople()).toEqual([]);
  });
});
