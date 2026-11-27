// Texts are encrypted on the device, so the storage only ever holds unreadable text.
//
// - Every user has one random data key. It encrypts the texts.
// - The data key is stored only in locked form, twice: locked with the password and with the recovery code.
// - The password and the recovery code themselves are never stored.

const passwordRounds = 600_000;
/** More than any version of the app has used; a larger number would only freeze the page. */
const maxRounds = 5_000_000;
const recoveryAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U: easy to misread
const recoveryLength = 24;

/** The data key locked with a password or a recovery code. */
type LockedKey = { salt: string; rounds: number; data: string };

export type StoredKeys = { version: 1; id: string; password: LockedKey; recovery: LockedKey };

export type DataKey = { id: string; key: CryptoKey };

type Bytes = Uint8Array<ArrayBuffer>;
type Kind = "password" | "recovery";

export async function createKeys(password: string): Promise<{ keys: StoredKeys; dataKey: DataKey; recoveryCode: string }> {
  const dataKey: DataKey = {
    id: crypto.randomUUID(),
    // Extractable: a device that is signed in can lock the key again after a password reset.
    key: await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]),
  };
  const recoveryCode = newRecoveryCode();
  const keys: StoredKeys = {
    version: 1,
    id: dataKey.id,
    password: await lock(dataKey, "password", password),
    recovery: await lock(dataKey, "recovery", normalizeCode(recoveryCode)),
  };
  return { keys, dataKey, recoveryCode };
}

/** Returns null if the password does not fit. */
export function openWithPassword(keys: StoredKeys, password: string): Promise<DataKey | null> {
  return unlock(keys, "password", password);
}

/** Returns null if the code does not fit. */
export async function openWithRecoveryCode(keys: StoredKeys, code: string): Promise<DataKey | null> {
  const clean = normalizeCode(code);
  return clean.length === recoveryLength ? unlock(keys, "recovery", clean) : null;
}

export async function withNewPassword(keys: StoredKeys, dataKey: DataKey, password: string): Promise<StoredKeys> {
  return { ...keys, password: await lock(dataKey, "password", password) };
}

export async function withNewRecoveryCode(keys: StoredKeys, dataKey: DataKey): Promise<{ keys: StoredKeys; recoveryCode: string }> {
  const recoveryCode = newRecoveryCode();
  return { keys: { ...keys, recovery: await lock(dataKey, "recovery", normalizeCode(recoveryCode)) }, recoveryCode };
}

export function isStoredKeys(value: unknown): value is StoredKeys {
  const keys = value as StoredKeys | null | undefined;
  return keys?.version === 1 && typeof keys.id === "string" && Boolean(keys.password?.data) && Boolean(keys.recovery?.data);
}

function newRecoveryCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(recoveryLength));
  const letters = [...random].map((value) => recoveryAlphabet[value % recoveryAlphabet.length]).join("");
  return letters.match(/.{4}/g)!.join("-");
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1").replace(/[^0-9A-Z]/g, "");
}

async function lock(dataKey: DataKey, kind: Kind, secret: string): Promise<LockedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapping = await deriveKey(secret, salt, passwordRounds);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dataKey.key));
  return { salt: toBase64(salt), rounds: passwordRounds, data: await seal(wrapping, raw, lockLabel(dataKey.id, kind)) };
}

async function unlock(keys: StoredKeys, kind: Kind, secret: string): Promise<DataKey | null> {
  const locked = keys[kind];
  if (!Number.isInteger(locked.rounds) || locked.rounds < 1 || locked.rounds > maxRounds) return null;
  try {
    const wrapping = await deriveKey(secret, fromBase64(locked.salt), locked.rounds);
    const raw = await open(wrapping, locked.data, lockLabel(keys.id, kind));
    return { id: keys.id, key: await crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]) };
  } catch {
    return null;
  }
}

function lockLabel(id: string, kind: Kind): string {
  return `focusflow-key/${id}/${kind}`;
}

async function deriveKey(secret: string, salt: Bytes, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts. The label is not secret; the same label is needed to decrypt, so texts cannot be swapped around. */
export async function seal(key: CryptoKey, bytes: Bytes, label: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(label) }, key, bytes));
  const joined = new Uint8Array(iv.length + sealed.length);
  joined.set(iv);
  joined.set(sealed, iv.length);
  return toBase64(joined);
}

/** Decrypts; throws if the key or the label is wrong, or the text was damaged. */
export async function open(key: CryptoKey, sealed: string, label: string): Promise<Bytes> {
  const joined = fromBase64(sealed);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: joined.slice(0, 12), additionalData: new TextEncoder().encode(label) },
    key,
    joined.slice(12),
  ));
}

function toBase64(bytes: Bytes): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Bytes {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
