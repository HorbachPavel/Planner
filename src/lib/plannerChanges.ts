import { emptyDocument, rollHorizons, type PlannerDocument, type StoredPerson, type StoredTask } from "./plannerDocument";

// Only what was really changed is sent to the storage (for example one title of one task).
// So a change made on the phone does not overwrite other changes made on the laptop.

/** Changed fields of one item, the whole item if it is new, or null if it was deleted. */
export type ItemChange<T> = Partial<T> | null;

export type PlannerChanges = {
  horizonRolloverDate?: string;
  tasks?: Record<string, ItemChange<StoredTask>>;
  people?: Record<string, ItemChange<StoredPerson>>;
};

type Item = { id: string };

export function isEmptyChange(changes: PlannerChanges): boolean {
  return Object.keys(changes).length === 0;
}

/** What has to be written to turn `before` into `after`. Never contains empty groups. */
export function diffDocuments(before: PlannerDocument, after: PlannerDocument): PlannerChanges {
  const changes: PlannerChanges = {};
  if (after.horizonRolloverDate && after.horizonRolloverDate !== before.horizonRolloverDate) {
    changes.horizonRolloverDate = after.horizonRolloverDate;
  }
  const tasks = diffItems(before.tasks, after.tasks);
  if (tasks) changes.tasks = tasks;
  const people = diffItems(before.people, after.people);
  if (people) changes.people = people;
  return changes;
}

function diffItems<T extends Item>(before: T[], after: T[]): Record<string, ItemChange<T>> | undefined {
  const changes: Record<string, ItemChange<T>> = {};
  const previous = new Map(before.map((item) => [item.id, item]));
  const kept = new Set(after.map((item) => item.id));
  for (const item of after) {
    const old = previous.get(item.id);
    if (old === item) continue;
    const changed = Object.entries(item).filter(([key, value]) => value !== undefined && (!old || old[key as keyof T] !== value));
    if (changed.length) changes[item.id] = Object.fromEntries(changed) as Partial<T>;
  }
  for (const item of before) {
    if (!kept.has(item.id)) changes[item.id] = null;
  }
  return Object.keys(changes).length ? changes : undefined;
}

/** Combines two changes into one; `second` was made later and wins. */
export function mergeChanges(first: PlannerChanges, second: PlannerChanges): PlannerChanges {
  const merged: PlannerChanges = { ...first, ...second };
  const tasks = mergeItems(first.tasks, second.tasks);
  if (tasks) merged.tasks = tasks;
  const people = mergeItems(first.people, second.people);
  if (people) merged.people = people;
  return merged;
}

function mergeItems<T extends Item>(
  first: Record<string, ItemChange<T>> = {},
  second: Record<string, ItemChange<T>> = {},
): Record<string, ItemChange<T>> | undefined {
  const merged = { ...first };
  for (const [id, change] of Object.entries(second)) {
    const old = merged[id];
    if (change === null || old === undefined) merged[id] = change;
    // A deleted item can only come back as a whole, not as a few fields.
    else if (old === null) merged[id] = change.id ? change : null;
    else merged[id] = { ...old, ...change };
  }
  return Object.keys(merged).length ? merged : undefined;
}

export function applyChanges(doc: PlannerDocument, changes: PlannerChanges): PlannerDocument {
  if (isEmptyChange(changes)) return doc;
  return {
    ...doc,
    horizonRolloverDate: changes.horizonRolloverDate ?? doc.horizonRolloverDate,
    tasks: applyItems(doc.tasks, changes.tasks),
    people: applyItems(doc.people, changes.people),
  };
}

function applyItems<T extends Item>(items: T[], changes: Record<string, ItemChange<T>> = {}): T[] {
  const known = new Set(items.map((item) => item.id));
  const next = items.flatMap((item) => {
    const change = changes[item.id];
    if (change === undefined) return [item];
    return change === null ? [] : [{ ...item, ...change }];
  });
  // Fields of an item that no longer exists (deleted on another device) are ignored.
  const added = Object.entries(changes).flatMap(([id, change]) => (!known.has(id) && change?.id ? [change as T] : []));
  return [...next, ...added];
}

/** Reads the stored form, where tasks and people are kept by id. */
export function decodeStored(data: unknown): PlannerDocument {
  const stored = (data ?? {}) as { version?: unknown; horizonRolloverDate?: unknown; tasks?: unknown; people?: unknown };
  if (stored.version !== 1) throw new Error("The stored list has an unexpected format.");
  return {
    version: 1,
    horizonRolloverDate: typeof stored.horizonRolloverDate === "string" ? stored.horizonRolloverDate : null,
    tasks: decodeItems<StoredTask>(stored.tasks, taskDefaults),
    people: decodeItems<StoredPerson>(stored.people, personDefaults),
  };
}

const taskDefaults: Partial<StoredTask> = {
  title: "", notes: "", status: "planned", horizon: "later", list: "work",
  sortOrder: 0, flagColor: null, completedAt: null, createdAt: "", updatedAt: "",
};

const personDefaults: Partial<StoredPerson> = {
  name: "", topics: "", pinned: false, sortOrder: 0, createdAt: "", updatedAt: "",
};

function decodeItems<T extends Item>(value: unknown, defaults: Partial<T>): T[] {
  const items = Object.values((value ?? {}) as Record<string, Partial<T>>);
  // An item without an id is a leftover: deleted on one device while being edited on another.
  return items.filter((item) => Boolean(item?.id)).map((item) => ({ ...defaults, ...item }) as T);
}

/** Adds items from the old list. Items that are already here are left alone, so it is safe to repeat. */
export function importDocument(
  doc: PlannerDocument,
  imported: PlannerDocument,
  now = new Date(),
): { document: PlannerDocument; added: number } {
  // The old list may be a few days behind: move its due dates to today first.
  const source = rollHorizons(imported, now).document;
  const tasks = missingItems(doc.tasks, source.tasks);
  const people = missingItems(doc.people, source.people);
  return {
    document: { ...doc, tasks: [...doc.tasks, ...tasks], people: [...doc.people, ...people] },
    added: tasks.length + people.length,
  };
}

function missingItems<T extends Item>(current: T[], candidates: T[]): T[] {
  const known = new Set(current.map((item) => item.id));
  return candidates.filter((item) => item.id && !known.has(item.id));
}

/** Checks a list in the file format (the old GitHub file and the exported file look the same). */
export function parseDocument(text: string): PlannerDocument {
  const parsed = JSON.parse(text) as Partial<PlannerDocument>;
  if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.people)) {
    throw new Error("The list file has an unexpected format.");
  }
  return {
    ...emptyDocument(),
    horizonRolloverDate: parsed.horizonRolloverDate ?? null,
    tasks: parsed.tasks,
    people: parsed.people,
  };
}
