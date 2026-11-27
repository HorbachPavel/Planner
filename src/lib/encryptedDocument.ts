import { open, seal, type DataKey } from "./keys";
import { decodeStored, type ItemChange, type PlannerChanges } from "./plannerChanges";
import type { PlannerDocument } from "./plannerDocument";

// Encrypts only the texts people write. Dates, status and order stay readable for the storage,
// so changes from two devices can still be combined field by field.

const secretFields = { tasks: ["title", "notes"], people: ["name", "topics"] } as const;

type Group = keyof typeof secretFields;
type Fields = Record<string, unknown>;

export const unreadableText = "[can’t be read]";

export type DocumentCipher = {
  encrypt: (changes: PlannerChanges) => Promise<PlannerChanges>;
  decrypt: (stored: unknown) => Promise<PlannerDocument>;
};

export function createDocumentCipher(uid: string, dataKey: DataKey): DocumentCipher {
  /** Texts that were already decrypted, so every update does not decrypt the whole list again. */
  let known = new Map<string, string>();

  function label(group: Group, id: string, field: string) {
    return `${uid}/${group}/${id}/${field}`;
  }

  async function encryptGroup<T>(group: Group, items: Record<string, ItemChange<T>>): Promise<Record<string, ItemChange<T>>> {
    const entries = await Promise.all(Object.entries(items).map(async ([id, change]) => {
      if (change === null) return [id, null] as const;
      const next: Fields = { ...change };
      for (const field of secretFields[group]) {
        const text = next[field];
        if (typeof text === "string") next[field] = await seal(dataKey.key, new TextEncoder().encode(text), label(group, id, field));
      }
      return [id, next as ItemChange<T>] as const;
    }));
    return Object.fromEntries(entries);
  }

  async function decryptGroup<T extends { id: string }>(group: Group, items: T[], used: Map<string, string>): Promise<T[]> {
    return Promise.all(items.map(async (item) => {
      const next: Fields = { ...item };
      for (const field of secretFields[group]) {
        const sealed = next[field];
        if (typeof sealed !== "string" || !sealed) continue; // the default for a missing text
        const place = label(group, item.id, field);
        const cacheKey = `${place}\n${sealed}`;
        let text = known.get(cacheKey);
        if (text === undefined) {
          try {
            text = new TextDecoder().decode(await open(dataKey.key, sealed, place));
          } catch {
            // One damaged text must not make the whole list unusable.
            text = unreadableText;
          }
        }
        used.set(cacheKey, text);
        next[field] = text;
      }
      return next as T;
    }));
  }

  return {
    async encrypt(changes) {
      return {
        ...changes,
        ...(changes.tasks ? { tasks: await encryptGroup("tasks", changes.tasks) } : {}),
        ...(changes.people ? { people: await encryptGroup("people", changes.people) } : {}),
      };
    },
    async decrypt(stored) {
      const doc = decodeStored(stored);
      const used = new Map<string, string>();
      const tasks = await decryptGroup("tasks", doc.tasks, used);
      const people = await decryptGroup("people", doc.people, used);
      known = used;
      return { ...doc, tasks, people };
    },
  };
}
