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

type PlannerClient = {
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

function PlannerProvider({ token, onSignOut, children }: { token: string; onSignOut: () => void; children: ReactNode }) {
  const documentRef = useRef<PlannerDocument>(emptyDocument());
  const shaRef = useRef<string | null>(null);
  const chain = useRef(Promise.resolve());
  const client = useMemo<PlannerClient>(() => {
    function run<T>(action: () => Promise<T>): Promise<T> {
      const next = chain.current.then(action, action);
      chain.current = next.then(() => undefined, () => undefined);
      return next;
    }

    async function persist(next: PlannerDocument): Promise<void> {
      try {
        shaRef.current = await writeDocument(token, next, shaRef.current);
        documentRef.current = next;
      } catch (error) {
        if (error instanceof GithubSaveError && error.sha) {
          shaRef.current = error.sha;
          documentRef.current = next;
        }
        throw error;
      }
    }

    return {
      load: () => run(async () => {
        const remote = await readDocument(token);
        shaRef.current = remote.sha;
        const rolled = rollHorizons(remote.document);
        if (remote.sha && rolled.changed) await persist(rolled.document);
        else documentRef.current = rolled.document;
        return { tasks: viewTasks(documentRef.current), people: viewPeople(documentRef.current) };
      }),
      createTask: (input) => run(async () => { await persist(addTask(documentRef.current, input)); }),
      patchTask: (id, patch) => run(async () => { await persist(patchTask(documentRef.current, id, patch)); }),
      reorderTasks: (ids, change) => run(async () => { await persist(reorderTasks(documentRef.current, ids, change)); }),
      createPerson: (name) => run(async () => { await persist(addPerson(documentRef.current, name)); }),
      patchPerson: (id, patch) => run(async () => { await persist(patchPerson(documentRef.current, id, patch)); }),
      deletePerson: (id) => run(async () => { await persist(deletePerson(documentRef.current, id)); }),
      reorderPeople: (ids, change) => run(async () => { await persist(reorderPeople(documentRef.current, ids, change)); }),
      signOut: onSignOut,
    };
  }, [onSignOut, token]);

  return <PlannerContext.Provider value={client}>{children}</PlannerContext.Provider>;
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
