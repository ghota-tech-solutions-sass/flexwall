"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicEntry } from "@/lib/store/entries";
import { formatUSD } from "@/lib/board";
import OutLink from "@/components/OutLink";
import SeatAvatar from "@/components/SeatAvatar";


/** Table complète du registre : recherche instantanée + rafraîchissement 12s. */
export default function RegisterTable({ initial, founders }: { initial: PublicEntry[]; founders?: string[] }) {
  const founderSet = new Set(founders ?? []);
  const [rows, setRows] = useState<PublicEntry[]>(initial);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive && Array.isArray(data.entries)) setRows(data.entries);
      } catch {
        /* réseau instable : on garde l'affichage courant */
      }
    }
    const id = setInterval(poll, 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) => e.name.toLowerCase().includes(q) || e.slug.includes(q));
  }, [rows, query]);

  const max = rows.length > 0 ? Math.max(rows[0].amountUSD, 1) : 1;

  return (
    <>
      <input
        className="field mono"
        placeholder="Search by name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search the register"
        style={{ maxWidth: 380, marginBottom: 16 }}
      />
      <p className="board-note mono" style={{ marginBottom: 14 }}>
        {filtered.length} of {rows.length} {rows.length === 1 ? "entry" : "entries"} · refreshes every 12s
      </p>

      <div className="list">
        {filtered.map((e, i) => {
          const rank = rows.findIndex((x) => x.slug === e.slug) + 1;
          return (
            <div className="rowi" key={e.slug}>
              <div
                className="row-bar"
                style={{ width: Math.max(1.5, (e.amountUSD / max) * 100) + "%" }}
              />
              <span className="rk mono">{String(rank).padStart(2, "0")}</span>
              <div className="hcell">
                <span className="handle-md">
                  <SeatAvatar entry={e} />
                  <a className="name-link" href={`/share/${e.slug}`}>{e.name}</a>
                  <OutLink name={e.name} />
                  {founderSet.has(e.slug) ? <span className="fstar" title="founding 100">★</span> : null}
                  {e.verified ? <span className="vdot" title="verified funds" /> : null}
                </span>
                <span className="row-sub mono">
                  <a className="share-link" href={`/share/${e.slug}`}>share ↗</a>
                  {(e.views ?? 0) > 0 ? <span className="views"> · {(e.views ?? 0).toLocaleString("en-US")} views</span> : null}
                </span>
              </div>
              <div className="acell">
                <span className="amt-md">{formatUSD(e.amountUSD)}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="rowi">
            <span className="rk">—</span>
            <div className="hcell">
              <span className="handle-md" style={{ color: "var(--muted)" }}>
                nothing matches "{query}"
              </span>
            </div>
            <span className="amt-md" />
          </div>
        ) : null}
      </div>
    </>
  );
}
