"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

/** Shows a new recovery code; it can't be shown again later. */
export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false); // the code can still be selected by hand
    }
  }

  return (
    <>
      <h2>Save your recovery code</h2>
      <p className="authNote">
        You need this code if you forget your password. Keep it in a password manager or on paper.
        Without both the password and this code, nobody can restore your list, not even the owner of this app.
      </p>
      <code className="recoveryCode">{code}</code>
      <button type="button" className="ghost" onClick={() => void copy()}><Copy size={15} /> {copied ? "Copied" : "Copy"}</button>
      <label className="savedCheck">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        I have saved the code
      </label>
      <button type="button" className="primary" disabled={!saved} onClick={onDone}>Continue</button>
    </>
  );
}
