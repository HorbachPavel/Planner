"use client";

import { FormEvent, ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { GithubSaveError, readDocument, writeDocument } from "@/lib/githubStore";
import {
  addPerson,
  addTask,
  deletePerson,
  emptyDocument,
  patchPerson,
  patchTask,
  reorderPeople,
  reorderTasks,
  rollHorizons,
  viewPeople,
  viewTasks,
  type Horizon,
  type PlannerDocument,
  type StoredPerson,
  type StoredTask,
  type TaskList,
} from "@/lib/plannerDocument";

const tokenKey = "focusflow.githubToken";
const retryDelayMs = 5000;

// How it works:
// 1. Every change is applied to the local copy of the list right away, so the screen updates instantly.
// 2. Saving to GitHub happens in the background. Several quick changes are combined into one save.
// 3. If a save fails, the change stays on screen, an error is shown, and the save is retried.

type PlannerClient = {
  tasks: StoredTask[];
  people: StoredPerson[];
  /** True while there are changes that have not reached GitHub yet. */
  saving: boolean;
  /** Message of the last failed background save, or "" if everything is fine. */
  saveError: string;
  clearSaveError: () => void;
  load: () => Promise<{ tasks: StoredTask[]; people: StoredPerson[] }>;
  createTask: (input: { title: string; horizon: Horizon; list: TaskList }) => Promise<void>;
  patchTask: (id: string, patch: Partial<StoredTask>) => Promise<void>;
  reorderTasks: (ids: string[], change?: { movedId: string; horizon: Horizon }) => Promise<void>;
  createPerson: (name: string) => Promise<void>;
  patchPerson: (id: string, patch: Partial<Pick<StoredPerson, "name" | "topics" | "pinned">>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  reorderPeople: (ids: string[], change?: { movedId: string; pinned: boolean }) => Promise<void>;
  signOut: () => void;
};

const PlannerContext = createContext<PlannerClient | null>(null);

export function usePlanner(): PlannerClient {
  const client = useContext(PlannerContext);
  if (!client) throw new Error("Planner is not ready.");
  return client;
}

export function PlannerGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToken(window.localStorage.getItem(tokenKey));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(tokenKey);
    setToken(null);
  }, []);

  if (!ready) return <div className="empty">Loading…</div>;
  if (!token) return <TokenForm onSave={(value) => { window.localStorage.setItem(tokenKey, value); setToken(value); }} />;
  return (
    <PlannerProvider token={token} onSignOut={signOut}>
      {children}
    </PlannerProvider>
  );
}

function isConflict(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("The list was changed from another device");
}

function PlannerProvider({ token, onSignOut, children }: { token: string; onSignOut: () => void; children: ReactNode }) {
  const documentRef = useRef<PlannerDocument>(emptyDocument());
  const shaRef = useRef<string | null>(null);
  const chain = useRef(Promise.resolve());
  /** Increases on every local change. Used to know whether there is something left to save. */
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const saveQueuedRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const [view, setView] = useState<{ tasks: StoredTask[]; people: StoredPerson[] }>({ tasks: [], people: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const client = useMemo(() => {
    function run<T>(action: () => Promise<T>): Promise<T> {
      const next = chain.current.then(action, action);
      chain.current = next.then(() => undefined, () => undefined);
      return next;
    }

    function hasUnsaved() {
      return revisionRef.current !== savedRevisionRef.current;
    }

    function show(doc: PlannerDocument) {
      setView({ tasks: viewTasks(doc), people: viewPeople(doc) });
    }

    async function persist(next: PlannerDocument): Promise<void> {
      try {
        shaRef.current = await writeDocument(token, next, shaRef.current);
      } catch (error) {
        // The main file was saved, only the backup failed: remember the new version anyway.
        if (error instanceof GithubSaveError && error.sha) shaRef.current = error.sha;
        throw error;
      }
    }

    function retryLater(error: unknown) {
      setSaveError(`Not saved yet, retrying… (${error instanceof Error ? error.message : "network error"})`);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        scheduleSave();
      }, retryDelayMs);
    }

    /** Puts one background save in the queue (if there is not one waiting already). */
    function scheduleSave() {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (saveQueuedRef.current) return;
      saveQueuedRef.current = true;
      setSaving(true);
      void run(async () => {
        saveQueuedRef.current = false;
        if (!hasUnsaved()) return;
        const revision = revisionRef.current;
        try {
          await persist(documentRef.current);
          savedRevisionRef.current = revision;
          setSaveError("");
        } catch (error) {
          if (error instanceof GithubSaveError) {
            // The list itself was saved; only the backup copy failed.
            savedRevisionRef.current = revision;
            setSaveError(error.message);
          } else if (isConflict(error)) {
            // Another device changed the list. Take the fresh version from GitHub.
            try {
              const remote = await readDocument(token);
              shaRef.current = remote.sha;
              documentRef.current = rollHorizons(remote.document).document;
              savedRevisionRef.current = revisionRef.current;
              show(documentRef.current);
              setSaveError("The list was changed on another device. The latest version was loaded; please repeat your last change.");
            } catch (reloadError) {
              retryLater(reloadError);
            }
          } else {
            retryLater(error);
          }
        } finally {
          if (!saveQueuedRef.current && !hasUnsaved()) setSaving(false);
        }
      });
    }

    /** Applies a change locally (instantly) and saves it in the background. */
    function change(apply: (doc: PlannerDocument) => PlannerDocument): Promise<void> {
      try {
        const next = apply(documentRef.current); // may throw, e.g. "Enter a task."
        documentRef.current = next;
        revisionRef.current += 1;
        show(next);
        scheduleSave();
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return {
      load: () => run(async () => {
        const revisionAtStart = revisionRef.current;
        const remote = await readDocument(token);
        // If something was changed on screen while loading, or not yet saved, keep the local version.
        if (revisionRef.current !== revisionAtStart || hasUnsaved()) {
          return { tasks: viewTasks(documentRef.current), people: viewPeople(documentRef.current) };
        }
        shaRef.current = remote.sha;
        const rolled = rollHorizons(remote.document);
        documentRef.current = rolled.document;
        show(rolled.document);
        if (remote.sha && rolled.changed) {
          revisionRef.current += 1;
          scheduleSave();
        }
        return { tasks: viewTasks(documentRef.current), people: viewPeople(documentRef.current) };
      }),
      createTask: (input: { title: string; horizon: Horizon; list: TaskList }) => change((doc) => addTask(doc, input)),
      patchTask: (id: string, patch: Partial<StoredTask>) => change((doc) => patchTask(doc, id, patch)),
      reorderTasks: (ids: string[], moved?: { movedId: string; horizon: Horizon }) => change((doc) => reorderTasks(doc, ids, moved)),
      createPerson: (name: string) => change((doc) => addPerson(doc, name)),
      patchPerson: (id: string, patch: Partial<Pick<StoredPerson, "name" | "topics" | "pinned">>) => change((doc) => patchPerson(doc, id, patch)),
      deletePerson: (id: string) => change((doc) => deletePerson(doc, id)),
      reorderPeople: (ids: string[], moved?: { movedId: string; pinned: boolean }) => change((doc) => reorderPeople(doc, ids, moved)),
      signOut: onSignOut,
    };
  }, [onSignOut, token]);

  // Warn before closing the tab while a change is still being saved.
  useEffect(() => {
    if (!saving) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);

  useEffect(() => () => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
  }, []);

  const clearSaveError = useCallback(() => setSaveError(""), []);

  const value = useMemo<PlannerClient>(
    () => ({ ...client, tasks: view.tasks, people: view.people, saving, saveError, clearSaveError }),
    [client, view, saving, saveError, clearSaveError],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

function TokenForm({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const token = value.trim();
    if (token) onSave(token);
  }
  return (
    <main className="tokenGate">
      <form className="tokenCard" onSubmit={submit}>
        <span className="brandMark">F</span>
        <h1>FocusFlow</h1>
        <p>Enter the GitHub token for the private list repository. It stays in this browser.</p>
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="GitHub token"
          aria-label="GitHub token"
          autoComplete="off"
        />
        <button className="primary" type="submit">Continue</button>
      </form>
    </main>
  );
}
