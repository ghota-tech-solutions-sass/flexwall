"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { HANDLE_MAX_LENGTH, Handle } from "@/domain/handle";
import { API, ROUTES } from "@/presentation/routes";
import { STORAGE_KEYS } from "@/presentation/storage-keys";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid" | "error";
async function check(handle: string, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`${API.handle}?${new URLSearchParams({ handle })}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Couldn't check this handle.");
  const result = await response.json();
  if (result.handle !== handle || typeof result.available !== "boolean") throw new Error("Invalid availability response.");
  return result.available;
}

/** Availability is checked against the registry; reservation happens after sign-in. */
export function ClaimForm({ compact = false, initialHandle = "" }: { compact?: boolean; initialHandle?: string }) {
  const router = useRouter();
  const statusId = useId();
  const [handle, setHandle] = useState(initialHandle);
  const [status, setStatus] = useState<Availability>(initialHandle ? "checking" : "idle");
  const [submitting, setSubmitting] = useState(false);
  const clean = handle.replace(/-+$/, "");
  useEffect(() => {
    if (!clean) { setStatus("idle"); return; }
    if (!Handle.isValid(clean)) { setStatus("invalid"); return; }
    const controller = new AbortController();
    setStatus("checking");
    const timer = setTimeout(() => {
      check(clean, controller.signal).then((available) => {
        if (!controller.signal.aborted) setStatus(available ? "available" : "taken");
      }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [clean]);
  const message = { idle: "", checking: "Checking availability…", available: "Available — claim it after signing in.", taken: "Already taken. Try another name.", invalid: "Use 2–30 letters, digits or hyphens; reserved names aren't available.", error: "Couldn't check. Try again." }[status];
  return <div className={`claim-wrap${compact ? " claim-wrap-compact" : ""}`}>
    <form className={`claim${compact ? " claim-compact" : ""}`} onSubmit={async (e) => {
      e.preventDefault();
      if (submitting || (clean && !Handle.isValid(clean))) return;
      setSubmitting(true);
      try {
        if (clean && !(await check(clean))) { setStatus("taken"); return; }
        try { if (clean) sessionStorage.setItem(STORAGE_KEYS.wantedHandle, clean); } catch { /* The URL carries it in private mode. */ }
        router.push(ROUTES.loginToClaim(clean));
      } catch { setStatus("error"); } finally { setSubmitting(false); }
    }}>
      <span>flexwall.lol/@</span>
      <input value={handle} onChange={(e) => { const next = Handle.slugify(e.target.value); setHandle(next); if (next.replace(/-+$/, "") !== clean) setStatus("checking"); }} placeholder="your-name" aria-label="Handle" aria-describedby={statusId} autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={HANDLE_MAX_LENGTH} disabled={submitting} />
      <button type="submit" className="btn btn-signal" disabled={submitting || (Boolean(clean) && ["checking", "taken", "invalid"].includes(status))}>
        {submitting ? "Checking…" : compact ? ({ idle: "Claim", checking: "Checking…", available: "Available", taken: "Taken", invalid: "Invalid", error: "Retry" }[status]) : status === "error" ? "Retry" : "Claim your wall"}
        {(!compact || status === "available") && <span className="btn-icon" aria-hidden="true"><ArrowUpRightIcon size={16} weight="bold" /></span>}
      </button>
    </form>
    <p id={statusId} className="claim-status" role="status" data-status={status}>{message}</p>
  </div>;
}
