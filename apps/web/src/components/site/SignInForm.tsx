"use client";

import { useState } from "react";
import { postJson } from "@/presentation/json";
import { API, SIGN_IN_PARAMS } from "@/presentation/routes";

/** `handle` is what was typed on the way here; it rides the emailed link so it is still there after the trip through the inbox. */
export function SignInForm({ handle }: { handle?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string; devLink?: string }>({ kind: "idle" });

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: "sending" });
        const res = await postJson<{ devLink?: string }>(API.signInRequest, { email, handle });
        if (!res.ok) return setState({ kind: "error", message: res.body.message ?? "Couldn't send the link." });
        // The browser's time zone travels with the link, so the new account's "today" is right.
        const devLink = res.body.devLink ? `${res.body.devLink}&${new URLSearchParams({ [SIGN_IN_PARAMS.timeZone]: Intl.DateTimeFormat().resolvedOptions().timeZone })}` : undefined;
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
