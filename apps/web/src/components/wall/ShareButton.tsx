"use client";

import { CheckIcon, DotsThreeIcon, ExportIcon, LinkSimpleIcon, XLogoIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { COPIED_FEEDBACK_MS } from "@/presentation/feedback";
import { postOnX } from "@/presentation/wall/profile";

/** The key that closes the menu, as `KeyboardEvent.key` names it. */
const CLOSE_KEY = "Escape";

/**
 * Share, as a small menu: copy the link, post it on X, or hand it to the
 * system share sheet where the browser has one.
 */
export function ShareButton({ url, title, className = "btn btn-small" }: { url: string; title: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [native, setNative] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => setNative(typeof navigator.share === "function"), []);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === CLOSE_KEY : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, COPIED_FEEDBACK_MS);
  };

  return (
    <div className="share" ref={root}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ExportIcon size={16} />
        Share
      </button>
      {open ? (
        <div className="share-menu" role="menu">
          <button type="button" role="menuitem" onClick={copy}>
            {copied ? <CheckIcon size={16} weight="bold" /> : <LinkSimpleIcon size={16} />}
            {copied ? "Link copied" : "Copy link"}
          </button>
          <a role="menuitem" href={postOnX(url, title)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <XLogoIcon size={16} />
            Post on X
          </a>
          {native ? (
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await navigator.share({ url, title }).catch(() => {});
              }}
            >
              <DotsThreeIcon size={16} weight="bold" />
              More options
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
