"use client";

import { ExportIcon } from "@phosphor-icons/react";
import { useState } from "react";

/** Opens the system share sheet where there is one, copies the link elsewhere. */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        if (navigator.share) {
          await navigator.share({ url, title }).catch(() => {});
          return;
        }
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <ExportIcon size={16} />
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
