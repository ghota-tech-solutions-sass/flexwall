"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HANDLE_MAX_LENGTH, Handle } from "@/domain/handle";

/** "flexwall.lol/@____ Claim": remembers the handle and sends people to sign in. */
export function ClaimForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  return (
    <form
      className="claim"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = handle.replace(/-+$/, "");
        try {
          if (clean) sessionStorage.setItem("fw:wanted-handle", clean);
        } catch {
          /* private mode: they'll type it again */
        }
        router.push("/login");
      }}
    >
      <span>flexwall.lol/@</span>
      <input
        value={handle}
        onChange={(e) => setHandle(Handle.slugify(e.target.value))}
        placeholder="your-name"
        aria-label="Handle"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={HANDLE_MAX_LENGTH}
      />
      <button type="submit" className="btn btn-signal">
        Claim
      </button>
    </form>
  );
}
