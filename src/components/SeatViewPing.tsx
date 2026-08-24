"use client";

import { useEffect } from "react";

/** Counts one public view of a seat per browser session. Requires JS: most crawlers don't count. */
export default function SeatViewPing({ slug }: { slug: string }) {
  useEffect(() => {
    const key = "fw_seen_" + slug;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* stockage bloqué : on compte quand même */
    }
    fetch("/api/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);
  return null;
}
