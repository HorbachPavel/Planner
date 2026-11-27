import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyChanges, type PlannerChanges } from "./plannerChanges";
import { addTask, emptyDocument, patchTask, type PlannerDocument } from "./plannerDocument";
import { createPlannerSync, type RemoteSnapshot, type SyncState } from "./plannerSync";

const now = new Date(2026, 10, 25, 10);

function listWith(...titles: string[]): PlannerDocument {
  return titles.reduce(
    (doc, title) => addTask(doc, { title, horizon: "today", list: "work" }, now),
    { ...emptyDocument(), horizonRolloverDate: "2026-11-25" } as PlannerDocument,
  );
}

function setup(server: PlannerDocument | null) {
  const writes: PlannerChanges[] = [];
  const fake = { server, online: true, failWrites: false, emit: (() => {}) as (snapshot: RemoteSnapshot) => void };
  let state: SyncState = { document: emptyDocument(), saving: false, saveError: "" };
  const sync = createPlannerSync({
    subscribe: (onSnapshot) => {
      fake.emit = onSnapshot;
      return () => {};
    },
    fetch: async () => {
      if (!fake.online) throw new Error("offline");
      return { document: fake.server, fromCache: false, hasPendingWrites: false };
    },
    write: async (changes) => {
      writes.push(changes);
      if (fake.failWrites) throw new Error("refused");
      fake.server = applyChanges(fake.server ?? emptyDocument(), changes);
    },
  }, (next) => { state = next; }, () => now);
  sync.start();
  return { sync, fake, writes, state: () => state, titles: () => state.document.tasks.map((task) => task.title) };
}

const add = (title: string) => (doc: PlannerDocument) => addTask(doc, { title, horizon: "today", list: "work" }, now);

describe("planner sync", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("shows a change at once and combines quick changes into one save", async () => {
    const { sync, writes, state, titles } = setup(listWith("A"));
    await sync.load();
    await sync.change(add("B"));
    await sync.change(add("C"));
    expect(titles()).toEqual(["A", "B", "C"]);
    expect(state().saving).toBe(true);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(writes).toHaveLength(1);
    expect(Object.keys(writes[0].tasks!)).toHaveLength(2);
    expect(state().saving).toBe(false);
  });

  it("refuses changes until the list is known, so a real list is never overwritten", async () => {
    const { sync, fake, writes } = setup(null);
    fake.online = false;
    fake.emit({ document: null, fromCache: true, hasPendingWrites: false });
    await expect(sync.load()).rejects.toThrow("offline");
    await expect(sync.change(add("A"))).rejects.toThrow("not loaded");
    expect(writes).toHaveLength(0);
  });

  it("does not write anything for a new user until the first change", async () => {
    const { sync, writes } = setup(null);
    await sync.load();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(0);
    await sync.change(add("First"));
    sync.flush();
    expect(writes[0].horizonRolloverDate).toBe("2026-11-25");
  });

  it("keeps an unsaved change on top of a change from another device", async () => {
    const start = listWith("A");
    const { sync, fake, titles } = setup(start);
    await sync.load();
    await sync.change(add("Mine"));
    fake.emit({ document: patchTask(start, start.tasks[0].id, { title: "Theirs" }), fromCache: false, hasPendingWrites: false });
    expect(titles()).toEqual(["Theirs", "Mine"]);
  });

  it("keeps a failed change on screen and retries it", async () => {
    const { sync, fake, state, titles } = setup(listWith("A"));
    await sync.load();
    fake.failWrites = true;
    await sync.change(add("B"));
    await vi.advanceTimersByTimeAsync(400);
    expect(state().saveError).toContain("refused");
    expect(titles()).toEqual(["A", "B"]);
    fake.failWrites = false;
    await vi.advanceTimersByTimeAsync(6000);
    expect(state()).toMatchObject({ saving: false, saveError: "" });
    expect(fake.server!.tasks.map((task) => task.title)).toEqual(["A", "B"]);
  });

  it("saves moved due dates only after hearing from the server", async () => {
    const old = { ...listWith("A"), horizonRolloverDate: "2026-11-24" };
    const { sync, fake, writes, state } = setup(old);
    fake.emit({ document: old, fromCache: true, hasPendingWrites: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().document.tasks[0].horizon).toBe("overdue");
    expect(writes).toHaveLength(0);
    await sync.load();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(1);
    expect(writes[0].horizonRolloverDate).toBe("2026-11-25");
  });

  it("saves the moved date together with a change made without a connection", async () => {
    const old = { ...listWith("A"), horizonRolloverDate: "2026-11-24" };
    const { sync, fake, writes } = setup(old);
    fake.online = false;
    fake.emit({ document: old, fromCache: true, hasPendingWrites: false });
    await sync.change(add("B"));
    sync.flush();
    expect(writes[0].horizonRolloverDate).toBe("2026-11-25");
    expect(writes[0].tasks![old.tasks[0].id]).toMatchObject({ horizon: "overdue" });
  });
});
