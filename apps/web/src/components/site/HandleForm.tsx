"use client";

import { sellablePlan } from "@/domain/pricing";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HANDLE_MAX_LENGTH, Handle } from "@/domain/handle";
import { postJson } from "@/presentation/json";
import { API, ROUTES } from "@/presentation/routes";
import { STORAGE_KEYS } from "@/presentation/storage-keys";

/** A handle that arrives from elsewhere gets the same treatment as one being typed, minus the hyphen left for the next word. */
const clean = (raw: string) => Handle.slugify(raw).replace(/-+$/, "");

/** `suggested` is the handle that travelled on the sign-in link; it wins over the one this browser happens to remember. */
export function HandleForm({ suggested, plan }: { suggested?: string; plan?: string }) {
  const router = useRouter();
  const [handle, setHandle] = useState(clean(suggested ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (suggested) return;
    try {
      setHandle(clean(sessionStorage.getItem(STORAGE_KEYS.wantedHandle) ?? ""));
    } catch {
      /* nothing remembered */
    }
  }, [suggested]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await postJson(API.handle, { handle });
        setBusy(false);
        if (!res.ok) return setError(res.body.message ?? "Couldn't claim that handle.");
        router.push(sellablePlan(plan) ? ROUTES.pricingForPlan(plan!) : ROUTES.edit);
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
