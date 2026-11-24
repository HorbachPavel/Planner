import { daysBetweenLocalDates, localDateKey, weeksBetweenLocalDates } from "./localDate";

export const horizons = ["overdue", "today", "tomorrow", "this_week", "next_week", "later"] as const;
export type Horizon = (typeof horizons)[number];
export type TaskList = "work" | "personal";
export type TaskStatus = "planned" | "in_progress" | "blocked" | "done" | "archived";

export type StoredTask = {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  horizon: Horizon;
  list: TaskList;
  sortOrder: number;
  flagColor: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A card on the "Notes & People" tab: a person with topics to discuss, or any note. */
export type StoredPerson = {
  id: string;
  name: string;
  topics: string;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PlannerDocument = {
  version: 1;
  horizonRolloverDate: string | null;
  tasks: StoredTask[];
  people: StoredPerson[];
};

const horizonRank: Record<Horizon, number> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
  this_week: 3,
  next_week: 4,
  later: 5,
};

export function emptyDocument(): PlannerDocument {
  return { version: 1, horizonRolloverDate: null, tasks: [], people: [] };
}

export function rollHorizons(doc: PlannerDocument, now = new Date()): { document: PlannerDocument; changed: boolean } {
  const today = localDateKey(now);
  if (!doc.horizonRolloverDate) {
    return { document: { ...doc, horizonRolloverDate: today }, changed: true };
  }
  const days = daysBetweenLocalDates(doc.horizonRolloverDate, today);
  if (days <= 0) return { document: doc, changed: false };
  // Weeks start on Monday. 1 = a new week has started, 2+ = at least one whole week was skipped.
  const weeks = weeksBetweenLocalDates(doc.horizonRolloverDate, today);
  const stamp = now.toISOString();
  const tasks = doc.tasks.map((task) => {
    if (task.status === "done" || task.status === "archived") return task;
    const horizon = nextHorizon(task.horizon, days, weeks);
    return horizon === task.horizon ? task : { ...task, horizon, updatedAt: stamp };
  });
  return { document: { ...doc, horizonRolloverDate: today, tasks }, changed: true };
}

function nextHorizon(horizon: Horizon, days: number, weeks: number): Horizon {
  switch (horizon) {
    case "today":
      return "overdue";
    case "tomorrow":
      return days === 1 ? "today" : "overdue";
    case "this_week":
      return weeks >= 1 ? "overdue" : "this_week";
    case "next_week":
      if (weeks === 1) return "this_week";
      return weeks >= 2 ? "overdue" : "next_week";
    default:
      return horizon;
  }
}

export function viewTasks(doc: PlannerDocument): StoredTask[] {
  return doc.tasks
    .filter((task) => task.status !== "archived")
    .slice()
    .sort((a, b) => horizonRank[a.horizon] - horizonRank[b.horizon] || a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));
}

export function viewPeople(doc: PlannerDocument): StoredPerson[] {
  return doc.people
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function addTask(
  doc: PlannerDocument,
  input: { title: string; horizon: Horizon; list: TaskList },
  now = new Date(),
): PlannerDocument {
  const title = input.title.trim();
  if (!title) throw new Error("Enter a task.");
  const duplicate = doc.tasks.some((task) => task.list === input.list && task.title === title && task.status !== "done");
  if (duplicate) throw new Error("A similar unfinished task already exists.");
  const stamp = now.toISOString();
  const task: StoredTask = {
    id: crypto.randomUUID(),
    title,
    notes: "",
    status: "planned",
    horizon: input.horizon,
    list: input.list,
    sortOrder: nextSortOrder(doc.tasks),
    flagColor: null,
    completedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  return { ...doc, tasks: [...doc.tasks, task] };
}

export function patchTask(doc: PlannerDocument, id: string, patch: Partial<StoredTask>, now = new Date()): PlannerDocument {
  const existing = doc.tasks.find((task) => task.id === id);
  if (!existing) throw new Error("Task not found.");
  const status = patch.status ?? existing.status;
  const horizonChanged = patch.horizon !== undefined && patch.horizon !== existing.horizon;
  const stamp = now.toISOString();
  const next: StoredTask = {
    ...existing,
    title: patch.title?.trim() || existing.title,
    notes: patch.notes ?? existing.notes,
    status,
    horizon: patch.horizon ?? existing.horizon,
    flagColor: patch.flagColor === undefined ? existing.flagColor : patch.flagColor,
    sortOrder: horizonChanged ? nextSortOrder(doc.tasks) : existing.sortOrder,
    updatedAt: stamp,
    completedAt: status === "done" ? (existing.completedAt ?? stamp) : null,
  };
  return { ...doc, tasks: doc.tasks.map((task) => (task.id === id ? next : task)) };
}

export function deleteTask(doc: PlannerDocument, id: string): PlannerDocument {
  return { ...doc, tasks: doc.tasks.filter((task) => task.id !== id) };
}

export function reorderTasks(
  doc: PlannerDocument,
  ids: string[],
  change?: { movedId: string; horizon: Horizon },
  now = new Date(),
): PlannerDocument {
  let tasks = doc.tasks;
  if (change) {
    const stamp = now.toISOString();
    tasks = tasks.map((task) => (task.id === change.movedId ? { ...task, horizon: change.horizon, updatedAt: stamp } : task));
  }
  return { ...doc, tasks: assignOrder(tasks, ids) };
}

export function addPerson(doc: PlannerDocument, name: string, now = new Date()): PlannerDocument {
  const clean = name.trim();
  if (!clean) throw new Error("Enter a name or a title.");
  const stamp = now.toISOString();
  const person: StoredPerson = {
    id: crypto.randomUUID(),
    name: clean,
    topics: "",
    pinned: false,
    sortOrder: nextSortOrder(doc.people),
    createdAt: stamp,
    updatedAt: stamp,
  };
  return { ...doc, people: [...doc.people, person] };
}

export function patchPerson(
  doc: PlannerDocument,
  id: string,
  patch: Partial<Pick<StoredPerson, "name" | "topics" | "pinned">>,
  now = new Date(),
): PlannerDocument {
  const existing = doc.people.find((person) => person.id === id);
  if (!existing) throw new Error("Person not found.");
  const stamp = now.toISOString();
  const next: StoredPerson = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    topics: patch.topics ?? existing.topics,
    pinned: patch.pinned ?? existing.pinned,
    sortOrder: patch.pinned === undefined ? existing.sortOrder : nextSortOrder(doc.people),
    updatedAt: stamp,
  };
  return { ...doc, people: doc.people.map((person) => (person.id === id ? next : person)) };
}

export function deletePerson(doc: PlannerDocument, id: string): PlannerDocument {
  return { ...doc, people: doc.people.filter((person) => person.id !== id) };
}

export function reorderPeople(
  doc: PlannerDocument,
  ids: string[],
  change?: { movedId: string; pinned: boolean },
  now = new Date(),
): PlannerDocument {
  let people = doc.people;
  if (change) {
    const stamp = now.toISOString();
    people = people.map((person) => (person.id === change.movedId ? { ...person, pinned: change.pinned, updatedAt: stamp } : person));
  }
  return { ...doc, people: assignOrder(people, ids) };
}

function nextSortOrder(items: Array<{ sortOrder: number }>): number {
  const values = items.map((item) => item.sortOrder);
  return (values.length ? Math.min(...values) : 10) - 10;
}

function assignOrder<T extends { id: string; sortOrder: number }>(items: T[], ids: string[]): T[] {
  const known = new Set(items.map((item) => item.id));
  const ordered = ids.filter((id) => known.has(id));
  const positions = items.filter((item) => ordered.includes(item.id)).map((item) => item.sortOrder).sort((a, b) => a - b);
  const unique = [...new Set(positions)];
  const slots = unique.length === ordered.length ? unique : ordered.map((_, index) => (positions[0] ?? 0) + index * 10);
  const next = new Map(ordered.map((id, index) => [id, slots[index]]));
  return items.map((item) => (next.has(item.id) ? { ...item, sortOrder: next.get(item.id)! } : item));
}
