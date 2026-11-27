import { describe, expect, it } from "vitest";
import { applyChanges, decodeStored, diffDocuments, importDocument, isEmptyChange, mergeChanges } from "./plannerChanges";
import { addPerson, addTask, deleteTask, emptyDocument, patchTask, type PlannerDocument } from "./plannerDocument";

const now = new Date(2026, 10, 25, 10);

function sample(): PlannerDocument {
  let doc: PlannerDocument = { ...emptyDocument(), horizonRolloverDate: "2026-11-25" };
  doc = addTask(doc, { title: "One", horizon: "today", list: "work" }, now);
  doc = addTask(doc, { title: "Two", horizon: "tomorrow", list: "personal" }, now);
  return addPerson(doc, "Anna", now);
}

describe("planner changes", () => {
  it("contains nothing, not even empty groups, when nothing changed", () => {
    const doc = sample();
    expect(diffDocuments(doc, { ...doc, tasks: doc.tasks.map((task) => ({ ...task })) })).toEqual({});
    expect(isEmptyChange(diffDocuments(doc, doc))).toBe(true);
  });

  it("contains only the changed fields of the changed task", () => {
    const doc = sample();
    const later = new Date(2026, 10, 25, 11);
    const id = doc.tasks[0].id;
    expect(diffDocuments(doc, patchTask(doc, id, { title: "New" }, later))).toEqual({
      tasks: { [id]: { title: "New", updatedAt: later.toISOString() } },
    });
  });

  it("restores the new document when applied", () => {
    const doc = sample();
    const next = addTask(deleteTask(doc, doc.tasks[0].id), { title: "Three", horizon: "later", list: "work" }, now);
    expect(applyChanges(doc, diffDocuments(doc, next))).toEqual(next);
  });

  it("keeps changes of two devices to different tasks", () => {
    const doc = sample();
    const [first, second] = doc.tasks;
    const phone = diffDocuments(doc, patchTask(doc, first.id, { title: "Phone" }));
    const laptop = diffDocuments(doc, patchTask(doc, second.id, { title: "Laptop" }));
    expect(applyChanges(applyChanges(doc, phone), laptop).tasks.map((task) => task.title)).toEqual(["Phone", "Laptop"]);
  });

  it("does not bring back a task deleted on another device", () => {
    const doc = sample();
    const id = doc.tasks[0].id;
    const edit = diffDocuments(doc, patchTask(doc, id, { title: "Edited" }));
    const deleted = deleteTask(doc, id);
    expect(applyChanges(deleted, edit).tasks.map((task) => task.title)).toEqual(["Two"]);
    expect(mergeChanges({ tasks: { [id]: null } }, edit).tasks).toEqual({ [id]: null });
  });

  it("merges changes so that the later one wins", () => {
    expect(mergeChanges({ tasks: { a: { title: "1", notes: "n" } } }, { tasks: { a: { title: "2" } }, people: { b: null } }))
      .toEqual({ tasks: { a: { title: "2", notes: "n" } }, people: { b: null } });
  });

  it("reads the stored form and skips leftovers of deleted items", () => {
    const doc = sample();
    const stored = {
      version: 1,
      horizonRolloverDate: doc.horizonRolloverDate,
      tasks: { ...Object.fromEntries(doc.tasks.map((task) => [task.id, task])), gone: { title: "Leftover" } },
      people: Object.fromEntries(doc.people.map((person) => [person.id, person])),
    };
    expect(decodeStored(stored)).toEqual(doc);
    expect(() => decodeStored({ version: 2 })).toThrow();
  });

  it("imports the old list once and moves its due dates to today", () => {
    const old = { ...sample(), horizonRolloverDate: "2026-11-24" };
    const first = importDocument(emptyDocument(), old, now);
    expect(first.added).toBe(3);
    expect(first.document.tasks.map((task) => task.horizon)).toEqual(["overdue", "today"]);
    expect(importDocument(first.document, old, now).added).toBe(0);
  });
});
