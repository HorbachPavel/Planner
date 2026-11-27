"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { KeyGate } from "@/components/KeyGate";
import { SignInForm } from "@/components/SignInForm";
import { firebase, signOutAndClear, updateStoredKeys, userStore } from "@/lib/firebase";
import { withNewRecoveryCode, type DataKey } from "@/lib/keys";
import { importDocument } from "@/lib/plannerChanges";
import {
  addPerson,
  addTask,
  deletePerson,
  deleteTask,
  emptyDocument,
  patchPerson,
  patchTask,
  reorderPeople,
  reorderTasks,
  viewPeople,
  viewTasks,
  type Horizon,
  type PlannerDocument,
  type StoredPerson,
  type StoredTask,
  type TaskList,
} from "@/lib/plannerDocument";
import { createPlannerSync, type SyncState } from "@/lib/plannerSync";

const signOutWaitMs = 3000;

type PlannerClient = {
  email: string;
  tasks: StoredTask[];
  people: StoredPerson[];
  /** True while there are changes that have not reached the server yet. */
  saving: boolean;
  /** Message of the last failed background save, or "" if everything is fine. */
  saveError: string;
  clearSaveError: () => void;
  load: () => Promise<void>;
  createTask: (input: { title: string; horizon: Horizon; list: TaskList }) => Promise<void>;
  patchTask: (id: string, patch: Partial<StoredTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  reorderTasks: (ids: string[], change?: { movedId: string; horizon: Horizon }) => Promise<void>;
  createPerson: (name: string) => Promise<void>;
  patchPerson: (id: string, patch: Partial<Pick<StoredPerson, "name" | "topics" | "pinned">>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  reorderPeople: (ids: string[], change?: { movedId: string; pinned: boolean }) => Promise<void>;
  /** The whole list, for saving it to a file. */
  exportDocument: () => PlannerDocument;
  /** Adds the items that are not in the list yet and returns how many were added. */
  importItems: (imported: PlannerDocument) => Promise<number>;
  /** Creates a new recovery code; the previous one stops working. */
  newRecoveryCode: () => Promise<string>;
  signOut: () => Promise<void>;
};

const PlannerContext = createContext<PlannerClient | null>(null);

export function usePlanner(): PlannerClient {
  const client = useContext(PlannerContext);
  if (!client) throw new Error("Planner is not ready.");
  return client;
}

export function PlannerGate({ children }: { children: ReactNode }) {
  /** undefined: not known yet; null: signed out. */
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const [password, setPassword] = useState("");
  /** Goes up when the key on this device turns out to be wrong, to ask for the password again. */
  const [wrongKeys, setWrongKeys] = useState(0);
  const onWrongKey = useCallback(() => {
    setPassword("");
    setWrongKeys((count) => count + 1);
  }, []);

  useEffect(() => onAuthStateChanged(firebase().auth, (next) => {
    if (!next) setPassword("");
    setUser(next);
  }), []);

  if (user === undefined) return <div className="empty">Loading…</div>;
  if (!user) return <SignInForm onPassword={setPassword} />;
  return (
    <KeyGate key={`${user.uid}/${wrongKeys}`} user={user} initialPassword={password} ignoreDeviceKey={wrongKeys > 0}>
      {(dataKey) => <PlannerProvider user={user} dataKey={dataKey} onWrongKey={onWrongKey}>{children}</PlannerProvider>}
    </KeyGate>
  );
}

function PlannerProvider({
  user,
  dataKey,
  onWrongKey,
  children,
}: {
  user: User;
  dataKey: DataKey;
  onWrongKey: () => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<SyncState>({ document: emptyDocument(), saving: false, saveError: "" });
  const [sync] = useState(() => createPlannerSync(userStore(user.uid, dataKey, onWrongKey), setState));

  const client = useMemo(() => ({
    load: sync.load,
    createTask: (input: { title: string; horizon: Horizon; list: TaskList }) => sync.change((doc) => addTask(doc, input)),
    patchTask: (id: string, patch: Partial<StoredTask>) => sync.change((doc) => patchTask(doc, id, patch)),
    deleteTask: (id: string) => sync.change((doc) => deleteTask(doc, id)),
    reorderTasks: (ids: string[], moved?: { movedId: string; horizon: Horizon }) => sync.change((doc) => reorderTasks(doc, ids, moved)),
    createPerson: (name: string) => sync.change((doc) => addPerson(doc, name)),
    patchPerson: (id: string, patch: Partial<Pick<StoredPerson, "name" | "topics" | "pinned">>) => sync.change((doc) => patchPerson(doc, id, patch)),
    deletePerson: (id: string) => sync.change((doc) => deletePerson(doc, id)),
    reorderPeople: (ids: string[], moved?: { movedId: string; pinned: boolean }) => sync.change((doc) => reorderPeople(doc, ids, moved)),
    exportDocument: () => {
      if (!sync.isReady()) throw new Error("The list is not loaded yet. Check the internet connection.");
      return sync.current();
    },
    importItems: async (imported: PlannerDocument) => {
      let added = 0;
      await sync.change((doc) => {
        const result = importDocument(doc, imported);
        added = result.added;
        return result.document;
      });
      return added;
    },
    newRecoveryCode: async () => {
      let code = "";
      await updateStoredKeys(user.uid, dataKey, async (keys) => {
        const next = await withNewRecoveryCode(keys, dataKey);
        code = next.recoveryCode;
        return next.keys;
      });
      return code;
    },
    signOut: async () => {
      sync.flush();
      const deadline = Date.now() + signOutWaitMs;
      while (sync.isSaving() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
      // Signing out clears this device, so unsent changes would be lost.
      if (sync.isSaving() && !window.confirm("Some changes are not saved yet. Sign out and lose them?")) return;
      await signOutAndClear();
    },
  }), [dataKey, sync, user.uid]);

  useEffect(() => {
    sync.start();
    function onHide() {
      if (document.visibilityState === "hidden") sync.flush();
    }
    function onOnline() {
      sync.load().catch(() => undefined);
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", sync.flush);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", sync.flush);
      window.removeEventListener("online", onOnline);
      sync.stop();
    };
  }, [sync]);

  // Warn before closing the tab while a change is still being saved.
  useEffect(() => {
    if (!state.saving) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.saving]);

  const clearSaveError = useCallback(() => sync.clearError(), [sync]);
  const tasks = useMemo(() => viewTasks(state.document), [state.document]);
  const people = useMemo(() => viewPeople(state.document), [state.document]);

  const value = useMemo<PlannerClient>(
    () => ({ ...client, email: user.email ?? "", tasks, people, saving: state.saving, saveError: state.saveError, clearSaveError }),
    [client, user.email, tasks, people, state.saving, state.saveError, clearSaveError],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}
