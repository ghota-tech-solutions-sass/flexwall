"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUSD as fmtUsd, makeIdentity, type Entry } from "@/lib/board";

interface Props {
  floor: number;
  tierNote: string | null;
  paymentsConfigured: boolean;
  board: Entry[];
}


/**
 * Modale d'entrée. Ouverture découplée du rendu : n'importe quel bouton
 * [data-open-entry] déclenche l'événement global "flexwall:entry" (avec un
 * montant prérempli optionnel via data-amount). La modale calcule en direct
 * le rang que le montant saisirait, et qui il passerait.
 */
export default function EntryModal({ floor, tierNote, paymentsConfigured, board }: Props) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState(String(floor));
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    function onOpen(e: Event) {
      // Opening with no preset starts at the floor, so the preview lights up
      // immediately and the entry price is never a guess.
      const preset = (e as CustomEvent).detail?.amount;
      setAmount(String(typeof preset === "number" && preset > 0 ? preset : floor));
      setState("idle");
      setMessage("");
      setOpen(true);
    }
    window.addEventListener("flexwall:entry", onOpen);
    // délégation globale pour tous les [data-open-entry] (SSR-friendly)
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest("[data-open-entry]");
      if (!el) return;
      e.preventDefault();
      const raw = (el as HTMLElement).getAttribute("data-amount");
      window.dispatchEvent(
        new CustomEvent("flexwall:entry", { detail: { amount: raw ? Number(raw) : undefined } })
      );
    }
    document.addEventListener("click", onClick);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    // Arrivée depuis un lien "Enter the list" / "Top up" d'une page sans modale.
    const params = new URLSearchParams(window.location.search);
    if (params.get("enter") === "1") {
      const name = params.get("name");
      const amt = Number(params.get("amount"));
      if (name) setHandle(name);
      setAmount(String(amt > 0 ? Math.round(amt) : floor));
      setOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    return () => {
      window.removeEventListener("flexwall:entry", onOpen);
      document.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [floor]);

  const parsed = Number(amount);
  const preview = useMemo(() => {
    if (!parsed || parsed < 1) return null;
    // Same name already on the wall = top-up: rank the cumulative total, no floor.
    // With no name typed yet the amount alone still previews a rank.
    const slug = handle.trim() ? makeIdentity(handle)?.slug : undefined;
    const existing = slug ? board.find((e) => e.slug === slug) : undefined;
    if (!existing && parsed < floor) return { belowFloor: true as const };
    const total = parsed + (existing?.amountUSD ?? 0);
    const others = existing ? board.filter((e) => e.slug !== existing.slug) : board;
    const better = others.filter((e) => e.amountUSD >= total).length; // égalité : premier arrivé garde l'avantage
    const rank = better + 1;
    // Landing past the last name is still a seat, not a rejection.
    const displaced = rank <= others.length ? others[rank - 1] : null;
    return { belowFloor: false as const, rank, displaced, topup: Boolean(existing), total };
  }, [parsed, handle, board, floor]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentsConfigured) {
      setState("error");
      setMessage("Payments aren't connected yet. The wall opens once Stripe is set up.");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, amount: parsed }),
      });
      const data = await res.json();
      if (res.status === 422 && data.error === "below_minimum") {
        setState("error");
        setMessage("Below the minimum. The floor is now " + fmtUsd(data.floor ?? floor) + ".");
        return;
      }
      if (!res.ok || !data.url) {
        setState("error");
        setMessage("Checkout didn't open. Try again.");
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setState("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <div
      className={"overlay" + (open ? " open" : "")}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Take a spot"
    >
      <div className="modal">
        <button className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        <h2>Take a spot</h2>
        <p className="sub">
          New names start at <b>{fmtUsd(floor)}</b>. Your rank is what you pay.
          Someone can always pay more.
        </p>

        <form onSubmit={submit}>
          <div className="form-line">
            <input
              className="field mono"
              placeholder="Your name: @handle, full name, company"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              required
              aria-label="Display name"
            />
            <input
              className="field mono"
              type="number"
              placeholder="Amount in USD"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              step="any"
              required
              aria-label="Amount in USD"
            />
          </div>

          <div
            className={"preview" + (preview && !preview.belowFloor ? " hot" : "")}
            aria-live="polite"
          >
            {!preview ? (
              <span>type an amount to see the spot it buys</span>
            ) : preview.belowFloor ? (
              <span>below the floor — new names start at {fmtUsd(floor)}.</span>
            ) : (
              <span>
                you&rsquo;re buying <span className="rank-big">#{preview.rank}</span>
                {preview.topup ? <span> ({fmtUsd(preview.total)} total)</span> : null}
                {preview.displaced ? (
                  <span>
                    {" "}— <span className="passes">{preview.displaced.name}</span> holds it
                    for {fmtUsd(preview.displaced.amountUSD)}
                  </span>
                ) : (
                  <span> — nobody to outbid. Yet.</span>
                )}
              </span>
            )}
          </div>

          <button className="submit-full" type="submit" disabled={state === "loading"}>
            {state === "loading"
              ? "Opening checkout…"
              : parsed > 0
                ? "Pay " + fmtUsd(parsed)
                : "Pay"}
          </button>
          <div className={"feedback" + (state === "error" ? " err" : "")}>{message}</div>
          <p className="fineprint">
            Minimum {fmtUsd(floor)} for a new name · same name adds to the same spot · no refunds
            {tierNote ? <b className="floor-note"> · {tierNote}</b> : null}
          </p>
        </form>
      </div>
    </div>
  );
}
