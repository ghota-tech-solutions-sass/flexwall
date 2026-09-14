"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HANDLE_MAX_LENGTH, Handle } from "@/domain/handle";

export function HandleForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setHandle(Handle.slugify(sessionStorage.getItem("fw:wanted-handle") ?? ""));
    } catch {
      /* nothing remembered */
    }
  }, []);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/me/handle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
        const body = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return setError(body.message ?? "Couldn't claim that handle.");
        router.push("/edit");
      }}
    >
      <label className="field">
        <span>Handle</span>
        <div className="claim" style={{ maxWidth: "none" }}>
          <span>@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(Handle.slugify(e.target.value))}
            onBlur={() => setHandle((h) => h.replace(/-+$/, ""))}
            placeholder="your-name"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={HANDLE_MAX_LENGTH}
            required
          />
        </div>
        <small>Letters, digits and hyphens. Spaces become hyphens as you type.</small>
      </label>
      <button type="submit" className="btn btn-signal" disabled={busy}>
        {busy ? "Claiming…" : "Claim and build my wall"}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
