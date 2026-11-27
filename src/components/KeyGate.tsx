"use client";

import { EmailAuthProvider, reauthenticateWithCredential, type User } from "firebase/auth";
import { Brain } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { RecoveryCode } from "@/components/RecoveryCode";
import { authMessage } from "@/lib/authMessage";
import { readDeviceKey, saveDeviceKey } from "@/lib/deviceKey";
import { createStoredKeys, readKeys, signOutAndClear, updateStoredKeys } from "@/lib/firebase";
import { createKeys, openWithPassword, openWithRecoveryCode, withNewPassword, type DataKey } from "@/lib/keys";

type Step =
  | { name: "working" }
  | { name: "password" }
  /** The password is right, but the list is still locked with an older one (it was reset by email). */
  | { name: "recovery"; password: string }
  | { name: "newCode"; code: string; dataKey: DataKey }
  | { name: "failed"; message: string }
  | { name: "ready"; dataKey: DataKey };

/** Finds the key with a password that is known to be right. */
async function openList(uid: string, password: string): Promise<Step> {
  let keys = await readKeys(uid);
  if (!keys) {
    const created = await createKeys(password);
    if (await createStoredKeys(uid, created.keys)) {
      await saveDeviceKey(uid, created.dataKey);
      return { name: "newCode", code: created.recoveryCode, dataKey: created.dataKey };
    }
    // Another device has created the keys at the same moment; use those.
    keys = await readKeys(uid);
    if (!keys) throw new Error("Couldn’t create the key. Try again.");
  }
  const opened = await openWithPassword(keys, password);
  if (opened) {
    await saveDeviceKey(uid, opened);
    return { name: "ready", dataKey: opened };
  }
  // The password was reset by email. If this device still has the key, lock it with the new password.
  const device = await readDeviceKey(uid);
  if (device?.id === keys.id) {
    await updateStoredKeys(uid, device, (current) => withNewPassword(current, device, password));
    return { name: "ready", dataKey: device };
  }
  return { name: "recovery", password };
}

/** Makes sure there is a key to read the list with, then shows the app. */
export function KeyGate({
  user,
  initialPassword,
  ignoreDeviceKey,
  children,
}: {
  user: User;
  /** The password just used to sign in, or "". */
  initialPassword: string;
  /** True after the key on this device turned out to be wrong. */
  ignoreDeviceKey: boolean;
  children: (dataKey: DataKey) => ReactNode;
}) {
  const [step, setStep] = useState<Step>({ name: "working" });
  const [attempt, setAttempt] = useState(0);
  /** One run per attempt: a second run would hide the recovery code of a new user. */
  const running = useRef<Promise<Step> | null>(null);

  useEffect(() => {
    let active = true;
    async function begin(): Promise<Step> {
      if (initialPassword) return openList(user.uid, initialPassword);
      const device = ignoreDeviceKey ? null : await readDeviceKey(user.uid);
      return device ? { name: "ready", dataKey: device } : { name: "password" };
    }
    running.current ??= begin();
    running.current.then(
      (next) => { if (active) setStep(next); },
      (error: unknown) => { if (active) setStep({ name: "failed", message: errorText(error) }); },
    );
    return () => { active = false; };
  }, [attempt, ignoreDeviceKey, initialPassword, user.uid]);

  async function submitPassword(password: string) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? "", password));
    setStep(await openList(user.uid, password));
  }

  async function submitRecovery(secret: string, password: string) {
    const keys = await readKeys(user.uid);
    const opened = keys && ((await openWithRecoveryCode(keys, secret)) ?? (await openWithPassword(keys, secret)));
    if (!opened) throw new Error("This code or password doesn’t fit.");
    await updateStoredKeys(user.uid, opened, (current) => withNewPassword(current, opened, password));
    await saveDeviceKey(user.uid, opened);
    setStep({ name: "ready", dataKey: opened });
  }

  if (step.name === "ready") return children(step.dataKey);
  if (step.name === "working") return <div className="empty">Loading…</div>;
  return (
    <main className="tokenGate">
      <section className="tokenCard">
        <span className="brandMark"><Brain size={22} /></span>
        {step.name === "newCode" && (
          <RecoveryCode code={step.code} onDone={() => setStep({ name: "ready", dataKey: step.dataKey })} />
        )}
        {step.name === "password" && (
          <UnlockForm
            key="password"
            title="Unlock your list"
            text={`Enter the password of ${user.email ?? "your account"}.`}
            placeholder="Password"
            autoComplete="current-password"
            onSubmit={submitPassword}
          />
        )}
        {step.name === "recovery" && (
          <UnlockForm
            key="recovery"
            title="Your password was changed"
            text="Your list is still locked with the old password. Enter your recovery code or the old password once."
            placeholder="Recovery code or old password"
            autoComplete="off"
            onSubmit={(secret) => submitRecovery(secret, step.password)}
          />
        )}
        {step.name === "failed" && (
          <>
            <h2>Couldn’t open the list</h2>
            <p className="authError" role="alert">{step.message}</p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                running.current = null;
                setStep({ name: "working" });
                setAttempt((count) => count + 1);
              }}
            >
              Try again
            </button>
          </>
        )}
        {step.name !== "newCode" && (
          <div className="authLinks"><button type="button" onClick={() => void signOutAndClear()}>Sign out</button></div>
        )}
      </section>
    </main>
  );
}

function UnlockForm({
  title,
  text,
  placeholder,
  autoComplete,
  onSubmit,
}: {
  title: string;
  text: string;
  placeholder: string;
  autoComplete: string;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(value);
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <form className="accountImport" onSubmit={submit}>
      <h2>{title}</h2>
      <p>{text}</p>
      <input
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={autoComplete}
        required
      />
      {error && <p className="authError" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? "Please wait…" : "Unlock"}</button>
    </form>
  );
}

function errorText(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (code === "unavailable") return "No connection. Check the internet and try again.";
  if (code.startsWith("auth/")) return authMessage(error);
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
