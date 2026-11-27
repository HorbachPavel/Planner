import { applyChanges, diffDocuments, isEmptyChange, mergeChanges, type PlannerChanges } from "./plannerChanges";
import { emptyDocument, rollHorizons, type PlannerDocument } from "./plannerDocument";

// How it works:
// 1. Every change is applied to the local copy of the list right away, so the screen updates instantly.
// 2. Saving happens in the background. Several quick changes are combined into one save.
// 3. If a save fails, the change stays on screen, an error is shown, and the save is retried.
// 4. Changes made on other devices arrive by themselves; unsaved local changes stay on top of them.

export type RemoteSnapshot = {
  /** null: this user has no list yet. */
  document: PlannerDocument | null;
  /** True when this is the copy kept on the device and the server has not confirmed it yet. */
  fromCache: boolean;
  /** True when the device still holds changes the server has not received. */
  hasPendingWrites: boolean;
};

export type PlannerStore = {
  subscribe: (onSnapshot: (snapshot: RemoteSnapshot) => void, onError: (error: unknown) => void) => () => void;
  /** Reads the list from the server; fails without a connection. */
  fetch: () => Promise<RemoteSnapshot>;
  /** Finishes when the server has accepted the changes (without a connection: much later). */
  write: (changes: PlannerChanges) => Promise<void>;
};

export type SyncState = { document: PlannerDocument; saving: boolean; saveError: string };

const saveDelayMs = 300;
const retryDelayMs = 5000;

export type PlannerSync = ReturnType<typeof createPlannerSync>;

export function createPlannerSync(store: PlannerStore, onState: (state: SyncState) => void, now: () => Date = () => new Date()) {
  let remote: RemoteSnapshot | null = null;
  /** The list including everything that was already handed over for saving. */
  let base = emptyDocument();
  /** The list on screen: `base` with the due dates moved to today. */
  let shown = emptyDocument();
  let pending: PlannerChanges = {};
  let inFlight: PlannerChanges[] = [];
  let saveError = "";
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  let stopped = true;

  function isSaving() {
    return !isEmptyChange(pending) || inFlight.length > 0 || Boolean(remote?.hasPendingWrites);
  }

  function publish() {
    if (!stopped) onState({ document: shown, saving: isSaving(), saveError });
  }

  /** `fresh`: the list has just come from the server, so moved due dates may be saved. */
  function rebuild(fresh: boolean) {
    if (!remote) return;
    base = [...inFlight, pending].reduce(applyChanges, remote.document ?? emptyDocument());
    const rolled = rollHorizons(base, now());
    shown = rolled.document;
    // An old copy must not be saved by itself: it could undo newer changes from another device.
    if (fresh && remote.document && rolled.changed) queue(shown);
    publish();
  }

  function receive(snapshot: RemoteSnapshot, fresh: boolean) {
    if (stopped) return;
    // An empty copy on the device says nothing about the real list: wait for the server.
    if (!snapshot.document && snapshot.fromCache) return;
    remote = snapshot;
    rebuild(fresh);
  }

  function queue(next: PlannerDocument) {
    const changes = diffDocuments(base, next);
    base = next;
    shown = next;
    if (isEmptyChange(changes)) return;
    pending = mergeChanges(pending, changes);
    schedule(saveDelayMs);
  }

  function schedule(delay: number) {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, delay);
  }

  /** Hands the collected changes over for saving now. */
  function flush() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    if (isEmptyChange(pending)) return;
    const changes = pending;
    pending = {};
    inFlight = [...inFlight, changes];
    store.write(changes).then(
      () => {
        inFlight = inFlight.filter((item) => item !== changes);
        saveError = "";
        publish();
      },
      (error: unknown) => {
        inFlight = inFlight.filter((item) => item !== changes);
        pending = mergeChanges(changes, pending);
        if (stopped) return;
        saveError = `Not saved yet, retrying… (${error instanceof Error ? error.message : "network error"})`;
        rebuild(false);
        schedule(retryDelayMs);
      },
    );
    publish();
  }

  function subscribe() {
    if (unsubscribe || stopped) return;
    unsubscribe = store.subscribe(
      (snapshot) => receive(snapshot, false),
      () => {
        // The subscription has ended; the next load() starts it again.
        unsubscribe = null;
      },
    );
  }

  return {
    start() {
      stopped = false;
      subscribe();
    },
    stop() {
      flush();
      stopped = true;
      unsubscribe?.();
      unsubscribe = null;
    },
    flush,
    isSaving,
    isReady: () => remote !== null,
    current: () => shown,
    async load(): Promise<void> {
      subscribe();
      try {
        receive(await store.fetch(), true);
      } catch (error) {
        // No connection: keep working with the copy on this device.
        if (!remote) throw error;
        rebuild(false);
      }
    },
    /** Applies a change locally (instantly) and saves it in the background. */
    async change(apply: (doc: PlannerDocument) => PlannerDocument): Promise<void> {
      if (!remote) throw new Error("The list is not loaded yet. Check the internet connection.");
      queue(apply(shown)); // apply may throw, e.g. "Enter a task."
      publish();
    },
    clearError() {
      saveError = "";
      publish();
    },
  };
}
