"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { HANDLE_MAX_LENGTH, Handle } from "@/domain/handle";
import { ROUTES } from "@/presentation/routes";
import { STORAGE_KEYS } from "@/presentation/storage-keys";

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
          if (clean) sessionStorage.setItem(STORAGE_KEYS.wantedHandle, clean);
        } catch {
          /* private mode: the address carries it anyway */
        }
        router.push(ROUTES.loginToClaim(clean));
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
        Claim your wall
        <span className="btn-icon" aria-hidden="true">
          <ArrowUpRightIcon size={16} weight="bold" />
        </span>
      </button>
    </form>
  );
}
