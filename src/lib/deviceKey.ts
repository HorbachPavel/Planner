import type { DataKey } from "./keys";

// Keeps the data key in this browser, so the password is only needed when signing in.
// If the browser storage is unavailable, the app still works and asks for the password each time.

const databaseName = "focusflow-keys";
const storeName = "keys";

export async function readDeviceKey(uid: string): Promise<DataKey | null> {
  try {
    const value = await run<DataKey | undefined>("readonly", (store) => store.get(uid));
    return value?.key ? value : null;
  } catch {
    return null;
  }
}

export async function saveDeviceKey(uid: string, dataKey: DataKey): Promise<void> {
  try {
    await run("readwrite", (store) => store.put(dataKey, uid));
  } catch {
    // See above.
  }
}

export async function forgetDeviceKey(uid: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(uid));
  } catch {
    // See above.
  }
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const opening = indexedDB.open(databaseName, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(storeName);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => {
        database.close();
        resolve(request.result as T);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}
