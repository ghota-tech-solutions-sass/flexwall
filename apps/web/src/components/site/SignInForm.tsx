"use client";

import { useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string; devLink?: string }>({ kind: "idle" });

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: "sending" });
        const res = await fetch("/api/auth/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return setState({ kind: "error", message: body.message ?? "Couldn't send the link." });
        // The browser's time zone travels with the link, so the new account's "today" is right.
        const devLink = body.devLink ? `${body.devLink}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}` : undefined;
        setState({ kind: "sent", devLink });
      }}
    >
      <label className="field">
        <span>Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <button type="submit" className="btn btn-signal" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state.kind === "sent" ? <p className="hint">Check your inbox: the link works for 20 minutes.</p> : null}
      {state.devLink ? (
        <p className="hint">
          Local development, no mailer configured: <a href={state.devLink}>open the sign-in link</a>.
        </p>
      ) : null}
      {state.kind === "error" ? <p className="error">{state.message}</p> : null}
    </form>
  );
}
