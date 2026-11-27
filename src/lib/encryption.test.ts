import { describe, expect, it } from "vitest";
import { createDocumentCipher, unreadableText } from "./encryptedDocument";
import { createKeys, openWithPassword, openWithRecoveryCode, withNewPassword, withNewRecoveryCode } from "./keys";
import { diffDocuments, type PlannerChanges } from "./plannerChanges";
import { addPerson, addTask, emptyDocument, patchTask } from "./plannerDocument";

const password = "correct horse battery";

/** What the storage would contain after saving the changes. */
function stored(changes: PlannerChanges) {
  return { version: 1, horizonRolloverDate: null, ...changes };
}

function sample() {
  const doc = addTask(emptyDocument(), { title: "Позвонить врачу", horizon: "today", list: "personal" });
  return addPerson(doc, "Anna");
}

describe("keys", () => {
  it("open with the password and the recovery code, and with nothing else", async () => {
    const { keys, dataKey, recoveryCode } = await createKeys(password);
    expect(recoveryCode).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
    expect((await openWithPassword(keys, password))?.id).toBe(dataKey.id);
    expect(await openWithPassword(keys, "wrong password")).toBeNull();
    expect((await openWithRecoveryCode(keys, recoveryCode.toLowerCase().replace(/-/g, " ")))?.id).toBe(dataKey.id);
    expect(await openWithRecoveryCode(keys, "0000-0000-0000-0000-0000-0000")).toBeNull();
  });

  it("do not contain the password, the recovery code or the open data key", async () => {
    const { keys, dataKey, recoveryCode } = await createKeys(password);
    const text = JSON.stringify(keys);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dataKey.key));
    expect(text).not.toContain(password);
    expect(text).not.toContain(recoveryCode);
    expect(text).not.toContain(btoa(String.fromCharCode(...raw)));
  });

  it("can be locked with a new password and a new recovery code, the old ones stop working", async () => {
    const first = await createKeys(password);
    const reset = await withNewPassword(first.keys, first.dataKey, "another long password");
    const next = await withNewRecoveryCode(reset, first.dataKey);
    expect(await openWithPassword(next.keys, password)).toBeNull();
    expect(await openWithPassword(next.keys, "another long password")).not.toBeNull();
    expect(await openWithRecoveryCode(next.keys, first.recoveryCode)).toBeNull();
    expect(await openWithRecoveryCode(next.keys, next.recoveryCode)).not.toBeNull();
  });
});

describe("encrypted list", () => {
  it("hides texts, keeps dates readable, and can be read back with a reopened key", async () => {
    const { keys, dataKey } = await createKeys(password);
    const doc = sample();
    const encrypted = await createDocumentCipher("me", dataKey).encrypt(diffDocuments(emptyDocument(), doc));
    const text = JSON.stringify(encrypted);
    expect(text).not.toContain("Позвонить");
    expect(text).not.toContain("Anna");
    expect(encrypted.tasks![doc.tasks[0].id]).toMatchObject({ horizon: "today", list: "personal", status: "planned" });
    const reopened = (await openWithPassword(keys, password))!;
    expect(await createDocumentCipher("me", reopened).decrypt(stored(encrypted))).toEqual(doc);
  });

  it("encrypts a change of one field and leaves the deletion marks alone", async () => {
    const { dataKey } = await createKeys(password);
    const doc = sample();
    const id = doc.tasks[0].id;
    const cipher = createDocumentCipher("me", dataKey);
    const change = await cipher.encrypt({ ...diffDocuments(doc, patchTask(doc, id, { title: "Secret" }, new Date(2030, 0, 1))), people: { gone: null } });
    expect(Object.keys(change.tasks![id]!).sort()).toEqual(["title", "updatedAt"]);
    expect(change.tasks![id]!.title).not.toContain("Secret");
    expect(change.people).toEqual({ gone: null });
  });

  it("shows a mark instead of a text that was damaged, moved or encrypted with another key", async () => {
    const { dataKey } = await createKeys(password);
    const other = await createKeys(password);
    const doc = sample();
    const id = doc.tasks[0].id;
    const encrypted = await createDocumentCipher("me", dataKey).encrypt(diffDocuments(emptyDocument(), doc));
    const asOther = await createDocumentCipher("other", dataKey).decrypt(stored(encrypted));
    expect(asOther.tasks[0].title).toBe(unreadableText);
    const wrongKey = await createDocumentCipher("me", other.dataKey).decrypt(stored(encrypted));
    expect(wrongKey.people[0].name).toBe(unreadableText);
    const swapped = { ...encrypted, tasks: { [id]: { ...encrypted.tasks![id], title: "plain text" } } };
    const result = await createDocumentCipher("me", dataKey).decrypt(stored(swapped));
    expect(result.tasks[0].title).toBe(unreadableText);
    expect(result.people[0].name).toBe("Anna");
  });
});
