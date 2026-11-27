import { getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, signOut, type Auth } from "firebase/auth";
import {
  clearIndexedDbPersistence,
  deleteField,
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  setDoc,
  terminate,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { forgetDeviceKey } from "./deviceKey";
import { createDocumentCipher } from "./encryptedDocument";
import { isStoredKeys, type DataKey, type StoredKeys } from "./keys";
import type { ItemChange, PlannerChanges } from "./plannerChanges";
import type { PlannerStore, RemoteSnapshot } from "./plannerSync";

// These values are not secret. The data is protected by the rules in firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyAvvsfezTUq81i_a42aI8AyYtu_vcUO6V8",
  authDomain: "focusflow-717b1.firebaseapp.com",
  projectId: "focusflow-717b1",
  storageBucket: "focusflow-717b1.firebasestorage.app",
  messagingSenderId: "984239010807",
  appId: "1:984239010807:web:386379357b30c482e6b4f2",
};

let services: { auth: Auth; db: Firestore } | null = null;

/** Started on first use, because the page is also built on a computer without a browser. */
export function firebase(): { auth: Auth; db: Firestore } {
  if (services) return services;
  const existing = getApps()[0];
  if (existing) {
    services = { auth: getAuth(existing), db: getFirestore(existing) };
  } else {
    const app = initializeApp(firebaseConfig);
    services = {
      auth: initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }),
      // Keeps a copy of the list and unsent changes on the device.
      db: initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
    };
  }
  return services;
}

/** The key on this device does not belong to the stored list. */
export class WrongKeyError extends Error {
  constructor() {
    super("This list needs to be unlocked again.");
    this.name = "WrongKeyError";
  }
}

/** Reads the locked keys from the server; null if this user has none yet. */
export async function readKeys(uid: string): Promise<StoredKeys | null> {
  const snapshot = await getDocFromServer(doc(firebase().db, "users", uid));
  return keysOf(snapshot.data());
}

/** Saves the keys of a new user. Returns false if another device was faster. */
export function createStoredKeys(uid: string, keys: StoredKeys): Promise<boolean> {
  const { db } = firebase();
  const reference = doc(db, "users", uid);
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(reference);
    if (keysOf(current.data())) return false;
    transaction.set(reference, { version: 1, keys }, { merge: true });
    return true;
  });
}

/** Changes how the same data key is locked (after a password reset, or for a new recovery code). */
export function updateStoredKeys(uid: string, dataKey: DataKey, change: (keys: StoredKeys) => Promise<StoredKeys>): Promise<void> {
  const { db } = firebase();
  const reference = doc(db, "users", uid);
  return runTransaction(db, async (transaction) => {
    const keys = keysOf((await transaction.get(reference)).data());
    if (!keys || keys.id !== dataKey.id) throw new WrongKeyError();
    transaction.set(reference, { keys: await change(keys) }, { merge: true });
  });
}

/** Never mistakes a list without usable keys for a new user: its texts would become unreadable. */
function keysOf(data: DocumentData | undefined): StoredKeys | null {
  if (isStoredKeys(data?.keys)) return data.keys;
  if (data?.keys || data?.tasks || data?.people) throw new Error("The stored list has an unexpected format.");
  return null;
}

export function userStore(uid: string, dataKey: DataKey, onWrongKey: () => void): PlannerStore {
  const reference = doc(firebase().db, "users", uid);
  const cipher = createDocumentCipher(uid, dataKey);
  // Decrypting and encrypting take a moment; the queues keep everything in the original order.
  let reading: Promise<unknown> = Promise.resolve();
  let writing: Promise<unknown> = Promise.resolve();

  function read(snapshot: DocumentSnapshot): Promise<RemoteSnapshot> {
    const result = reading.then(async () => {
      const { fromCache, hasPendingWrites } = snapshot.metadata;
      const data = snapshot.data();
      if (data && data.keys?.id !== dataKey.id) {
        // An incomplete copy on the device proves nothing: wait for the server.
        if (fromCache) return { document: null, fromCache, hasPendingWrites };
        onWrongKey();
        throw new WrongKeyError();
      }
      return { document: data ? await cipher.decrypt(data) : null, fromCache, hasPendingWrites };
    });
    reading = result.catch(() => undefined);
    return result;
  }

  return {
    subscribe: (onNext, onError) => {
      const stop = onSnapshot(
        reference,
        { includeMetadataChanges: true },
        (snapshot) => {
          read(snapshot).then(onNext, (error: unknown) => {
            stop();
            onError(error);
          });
        },
        onError,
      );
      return stop;
    },
    fetch: async () => read(await getDocFromServer(reference)),
    write: async (changes) => {
      const encrypted = writing.then(() => cipher.encrypt(changes));
      writing = encrypted.catch(() => undefined);
      await setDoc(reference, encodeChanges(await encrypted), { merge: true });
    },
  };
}

function encodeChanges(changes: PlannerChanges): Record<string, unknown> {
  return {
    version: 1,
    ...(changes.horizonRolloverDate ? { horizonRolloverDate: changes.horizonRolloverDate } : {}),
    // Careful: an empty group here would erase the whole group in the storage.
    ...(changes.tasks ? { tasks: encodeItems(changes.tasks) } : {}),
    ...(changes.people ? { people: encodeItems(changes.people) } : {}),
  };
}

function encodeItems<T>(items: Record<string, ItemChange<T>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(items).map(([id, change]) => [id, change ?? deleteField()]));
}

/** Signs out and removes the key and the copy of the list from this device. */
export async function signOutAndClear(): Promise<void> {
  const { auth, db } = firebase();
  if (auth.currentUser) await forgetDeviceKey(auth.currentUser.uid);
  await signOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Not possible while FocusFlow is open in another tab.
  }
  window.location.reload();
}
