"use client";

import { Download, KeyRound, LogOut, Upload, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { RecoveryCode } from "@/components/RecoveryCode";
import { usePlanner } from "@/components/PlannerProvider";
import { readGithubList } from "@/lib/githubImport";
import { localDateKey } from "@/lib/localDate";
import { hasFinePointer } from "@/lib/touchReorder";

/** Where the previous version of the app kept the GitHub token. */
const oldTokenKey = "focusflow.githubToken";

function readOldToken(): string {
  try {
    return window.localStorage.getItem(oldTokenKey) ?? "";
  } catch {
    return "";
  }
}

/** The token is not needed after the import. */
function forgetOldToken() {
  try {
    window.localStorage.removeItem(oldTokenKey);
  } catch {
    // Storage can be unavailable (e.g. private mode).
  }
}

export function AccountPanel({ onClose }: { onClose: () => void }) {
  const planner = usePlanner();
  const [importing, setImporting] = useState(false);
  const [token, setToken] = useState(readOldToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [newCode, setNewCode] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !newCode) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newCode, onClose]);

  async function exportFile() {
    try {
      const text = JSON.stringify(planner.exportDocument(), null, 2);
      await saveFile(new File([text], `focusflow-${localDateKey(new Date())}.json`, { type: "application/json" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t export the list.");
    }
  }

  async function importOldList(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const added = await planner.importItems(await readGithubList(token.trim()));
      forgetOldToken();
      setMessage(added ? `Added ${added} items. Wait until “Saving…” disappears.` : "Everything is already here, nothing to add.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t import the old list.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceRecoveryCode() {
    if (!window.confirm("Create a new recovery code? The previous one will stop working.")) return;
    setBusy(true);
    setMessage("");
    try {
      setNewCode(await planner.newRecoveryCode());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t create a new recovery code.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await planner.signOut();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (newCode) {
    return (
      <div className="accountOverlay">
        <section className="tokenCard accountCard" role="dialog" aria-modal="true" aria-label="Recovery code">
          <RecoveryCode code={newCode} onDone={() => setNewCode("")} />
        </section>
      </div>
    );
  }

  return (
    <div className="accountOverlay" onClick={onClose}>
      <section className="tokenCard accountCard" role="dialog" aria-modal="true" aria-label="Account" onClick={(event) => event.stopPropagation()}>
        <div className="accountHead">
          <h2>Account</h2>
          <button type="button" className="footerButton" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p>{planner.email}</p>
        <button type="button" className="ghost" onClick={() => void exportFile()}><Download size={15} /> Export to file (not encrypted)</button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void replaceRecoveryCode()}><KeyRound size={15} /> New recovery code</button>
        {importing ? (
          <form className="accountImport" onSubmit={importOldList}>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="GitHub token"
              aria-label="GitHub token"
              autoComplete="off"
            />
            <button className="primary" type="submit" disabled={busy}>{busy ? "Please wait…" : "Import"}</button>
          </form>
        ) : (
          <button type="button" className="ghost" onClick={() => setImporting(true)}><Upload size={15} /> Import from the old GitHub list</button>
        )}
        {message && <p className="authNote" role="status">{message}</p>}
        <button type="button" className="ghost" disabled={busy} onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
      </section>
    </div>
  );
}

/** iPhone: the Share sheet ("Save to Files"). Computer: an ordinary download. */
async function saveFile(file: File) {
  if (!hasFinePointer() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
