"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "flexwall.lol/@____ Claim": remembers the handle and sends people to sign in. */
export function ClaimForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  return (
    <form
      className="claim"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = handle.trim().replace(/^@/, "").toLowerCase();
        try {
          if (clean) sessionStorage.setItem("fw:wanted-handle", clean);
        } catch {
          /* private mode: they'll type it again */
        }
        router.push("/login");
      }}
    >
      <span>flexwall.lol/@</span>
      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="yourname" aria-label="Handle" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={24} />
      <button type="submit" className="btn btn-signal">
        Claim
      </button>
    </form>
  );
}
