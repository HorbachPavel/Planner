"use client";

import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { Brain } from "lucide-react";
import { FormEvent, useState } from "react";
import { authMessage, minPasswordLength } from "@/lib/authMessage";
import { firebase } from "@/lib/firebase";

type Mode = "signIn" | "create" | "reset";

const submitLabels: Record<Mode, string> = {
  signIn: "Sign in",
  create: "Create account",
  reset: "Send reset link",
};

/** `onPassword` gets the password just before signing in: it also unlocks the list. */
export function SignInForm({ onPassword }: { onPassword: (password: string) => void }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function switchTo(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { auth } = firebase();
    const address = email.trim();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode !== "reset") onPassword(password);
      if (mode === "signIn") await signInWithEmailAndPassword(auth, address, password);
      if (mode === "create") await createUserWithEmailAndPassword(auth, address, password);
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, address);
        setNotice("If there is an account with this email, a reset link is on its way. Check the spam folder too. After the reset you will also need your recovery code or the old password.");
      }
    } catch (failure) {
      onPassword("");
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="tokenGate">
      <form className="tokenCard" onSubmit={submit}>
        <span className="brandMark"><Brain size={22} /></span>
        <h1>FocusFlow</h1>
        <p>{mode === "create" ? "Create an account to keep your own private list." : mode === "reset" ? "Enter your email to choose a new password." : "Sign in to open your list."}</p>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          aria-label="Email"
          autoComplete="username"
          required
        />
        {mode !== "reset" && (
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "create" ? `Password (at least ${minPasswordLength} characters)` : "Password"}
            aria-label="Password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            minLength={mode === "create" ? minPasswordLength : undefined}
            required
          />
        )}
        {mode === "create" && (
          <p className="authNote">
            The texts of your tasks and notes are encrypted on your device, so the owner of this app can’t read
            them in the storage (Google Firebase). The owner can see your email, how many items you have, their dates
            and statuses, and also controls the code of this app. Don’t keep passwords or secrets here.
          </p>
        )}
        {error && <p className="authError" role="alert">{error}</p>}
        {notice && <p className="authNote" role="status">{notice}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? "Please wait…" : submitLabels[mode]}</button>
        <div className="authLinks">
          {mode !== "signIn" && <button type="button" onClick={() => switchTo("signIn")}>Sign in</button>}
          {mode !== "create" && <button type="button" onClick={() => switchTo("create")}>Create account</button>}
          {mode !== "reset" && <button type="button" onClick={() => switchTo("reset")}>Forgot password?</button>}
        </div>
      </form>
    </main>
  );
}
