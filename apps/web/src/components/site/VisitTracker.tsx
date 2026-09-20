"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { API } from "@/presentation/routes";
import { visitTarget } from "@/presentation/visit-paths";

/** One anonymous event per visible navigation; no cookies, storage or visitor identity. */
export function VisitTracker() {
  const path = usePathname();
  const navigation = useRef<{ path: string; sent: boolean } | null>(null);
  useEffect(() => {
    if (navigation.current?.path !== path) navigation.current = { path, sent: false };
    const current = navigation.current!;
    if (!visitTarget(path) || navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      if (current.sent || document.visibilityState !== "visible") return;
      current.sent = true;
      void fetch(API.visits, { method: "POST", credentials: "omit", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), path }) }).catch(() => {});
    };
    const schedule = () => { clearTimeout(timer); if (document.visibilityState === "visible") timer = setTimeout(send, 600); };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", schedule); };
  }, [path]);
  return null;
}
