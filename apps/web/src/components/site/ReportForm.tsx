"use client";

import { useState } from "react";

export function ReportForm({ handle: initial }: { handle: string }) {
  const [handle, setHandle] = useState(initial);
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  if (state === "sent") return <p className="hint">Thanks. We&apos;ll look at it.</p>;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, reason, contact }) });
        const body = await res.json().catch(() => ({}));
        setState(res.ok ? "sent" : (body.message ?? "Couldn't send the report."));
      }}
    >
      <label className="field">
        <span>Wall</span>
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" required />
      </label>
      <label className="field">
        <span>What&apos;s wrong</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={1000} />
      </label>
      <label className="field">
        <span>Your email, if you want an answer</span>
        <input type="email" value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-signal">
        Send report
      </button>
      {state !== "idle" ? <p className="error">{state}</p> : null}
    </form>
  );
}
