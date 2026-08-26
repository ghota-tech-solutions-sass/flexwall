"use client";

import { useEffect, useState } from "react";
import { formatUSD } from "@/lib/board";
import { xIntentUrl } from "@/lib/share";

interface Seat {
  slug: string;
  name: string;
  amountUSD: number;
  rank: number;
  total: number;
  createdAt: number;
  toPassAbove: { name: string; neededUSD: number } | null;
}

interface Payment {
  type: "entry" | "topup";
  amountUSD: number;
  ts: number;
}

/**
 * Ma place. Deux chemins :
 *  - cookie de session (posé au retour du checkout) → chargement automatique
 *  - sinon fallback email (rate-limité) — n'importe qui ayant l'email EXACT
 *    peut voir la place ; c'est documenté sous le formulaire.
 */
function shareUrl(slug: string): string {
  return (typeof window !== "undefined" ? window.location.origin : "https://flexwall.lol") + "/share/" + slug;
}

/** Top-up link: opens the entry modal on the wall with name + amount prefilled. No floor on top-ups. */
function topUpHref(seat: Seat): string {
  const amount = seat.toPassAbove ? seat.toPassAbove.neededUSD : "";
  return `/?enter=1&name=${encodeURIComponent(seat.name)}${amount ? `&amount=${amount}` : ""}`;
}

export default function SeatLookup({
  authedSlug,
  welcome = false,
  linkExpired = false,
}: {
  authedSlug: string | null;
  welcome?: boolean;
  linkExpired?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [seat, setSeat] = useState<Seat | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(linkExpired ? "That link has expired. Ask for a new one below." : "");
  const [triedAuto, setTriedAuto] = useState(false);

  async function loadFromCookie() {
    setState("loading");
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();
      if (data.found) {
        setSeat(data.seat as Seat);
        setPayments((data.payments ?? []) as Payment[]);
      }
    } catch {
      setError("Network error. Try again.");
    }
    setState("idle");
  }

  useEffect(() => {
    if (authedSlug && !triedAuto) {
      setTriedAuto(true);
      loadFromCookie();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedSlug]);

  /** Email path: the server mails a magic link. It never says whether the email holds a seat. */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("loading");
    try {
      const res = await fetch("/api/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) setError("Too many requests. Try again in an hour.");
      else if (res.status === 503) setError("Email links aren't available yet. Open this page in the browser you paid from.");
      else if (!res.ok) setError("That didn't go through. Try again.");
      else setSent(true);
    } catch {
      setError("Network error. Try again.");
    }
    setState("idle");
  }

  // Le webhook Stripe peut écrire la place une seconde après le retour de
  // checkout : tant que la session est valide et que le fetch n'a pas répondu,
  // on attend. Sans ça, chaque paiement réussi affichait d'abord
  // "that spot isn't on the wall anymore".
  const claiming = Boolean(authedSlug) && !seat && (state === "loading" || !triedAuto);

  if (claiming) {
    return (
      <div style={{ maxWidth: 560 }}>
        <p className="note">Writing your name to the wall…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {!seat ? (
        <form onSubmit={submit} className="entry" style={{ marginTop: 0 }}>
          <h2>{sent ? "Check your inbox" : "Find my spot"}</h2>
          <p className="note">
            {sent
              ? "If that email holds a spot, a link is on its way. It works for 30 minutes."
              : authedSlug
                ? welcome
                  ? "Payment received. Your spot is being written to the wall — refresh in a few seconds."
                  : "We found your session, but that spot isn't on the wall anymore."
                : "Enter the email you used at checkout and we'll send you a link. Or open this page in the browser you paid from."}
          </p>
          {!sent ? (
            <div className="form-line">
              <input
                className="field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Checkout email"
              />
              <button className="submit" type="submit" disabled={state === "loading"}>
                {state === "loading" ? "Sending…" : "Send my link"}
              </button>
            </div>
          ) : null}
          {error ? <p className="feedback err">{error}</p> : null}
          <p className="fineprint" style={{ textAlign: "left" }}>
            The link goes only to the email used at checkout. Your email is never shown on the wall.
          </p>
        </form>
      ) : (
        <>
          <div className="why-block" style={{ marginTop: 24 }}>
            <p className="section-label">your spot</p>
            <h3 style={{ fontSize: "clamp(30px,4vw,44px)" }}>
              #{seat.rank} <span style={{ color: "var(--faint)" }}>of</span> {seat.total}
            </h3>
            <p className="subline" style={{ marginTop: 10, fontSize: 15 }}>
              <b>{seat.name}</b> · {formatUSD(seat.amountUSD)} on display since{" "}
              {new Date(seat.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
            </p>
            {seat.toPassAbove ? (
              <p className="pass-hint" style={{ fontSize: 13, marginTop: 10 }}>
                +{formatUSD(seat.toPassAbove.neededUSD)} outbids{" "}
                <b>{seat.toPassAbove.name}</b> and takes #{Math.max(1, seat.rank - 1)}
              </p>
            ) : (
              <p className="pass-hint green" style={{ fontSize: 13, marginTop: 10 }}>
                You hold #1. Nobody above you. For now.
              </p>
            )}
            <div className="share-actions" style={{ justifyContent: "flex-start", marginTop: 16 }}>
              <a className="btn-take" href={topUpHref(seat)}>
                {seat.toPassAbove
                  ? `Outbid ${seat.toPassAbove.name} · +${formatUSD(seat.toPassAbove.neededUSD)}`
                  : "Top up"}
              </a>
              <a className="btn-ghost" href={`/?enter=1&name=${encodeURIComponent(seat.name)}`}>Add any amount</a>
            </div>
          </div>

          <div className={"share-prompt" + (welcome ? " hot" : "")}>
            <div>
              <p className="section-label">{welcome ? "tell them" : "share your spot"}</p>
              <p className="share-prompt-text">
                {welcome
                  ? "Your spot is live. Post it and see who comes to take it."
                  : "Post your rank and dare someone to outbid it."}
              </p>
            </div>
            <div className="share-actions" style={{ marginTop: 0 }}>
              <a
                className="btn-take"
                href={xIntentUrl({ rank: seat.rank, amountUSD: seat.amountUSD, url: shareUrl(seat.slug) })}
                target="_blank"
                rel="noopener noreferrer"
              >
                Post on X
              </a>
              <a className="btn-ghost" href={"/share/" + seat.slug}>Share card</a>
            </div>
          </div>

          <div className="list" style={{ marginTop: 26 }}>
            {payments.map((p, i) => (
              <div className="rowi" key={i}>
                <span className="rk mono">{String(i + 1).padStart(2, "0")}</span>
                <div className="hcell">
                  <span className="handle-md">{p.type === "entry" ? "Entry" : "Top-up"}</span>
                  <div className="pass-hint">{new Date(p.ts).toLocaleString("en-US")}</div>
                </div>
                <div className="acell">
                  <span className="amt-md green">+{formatUSD(p.amountUSD)}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn-ghost"
            style={{ marginTop: 20 }}
            onClick={() => { setSeat(null); setEmail(""); }}
          >
            close
          </button>
        </>
      )}
    </div>
  );
}
