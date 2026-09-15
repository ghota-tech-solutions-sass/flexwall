"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { connectionName, type ConnectionView } from "@/domain/connection";
import { CONNECT_PARAMS } from "@/presentation/routes";

/**
 * What happened while the owner was away signing in at a provider, read once
 * from the address they came back to, then taken out of it so a reload or a
 * shared link doesn't say it again.
 */
export function ConnectNotice({ connections, onConnected }: { connections: readonly ConnectionView[]; onConnected?: (connectionId: string) => void }) {
  const [notice, setNotice] = useState<{ kind: "connected" | "error"; text: string } | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get(CONNECT_PARAMS.connected);
    const error = url.searchParams.get(CONNECT_PARAMS.error);
    if (!connected && !error) return;
    url.searchParams.delete(CONNECT_PARAMS.connected);
    url.searchParams.delete(CONNECT_PARAMS.error);
    // Through the router: a bare history.replaceState is undone by the App Router's own state.
    router.replace(pathname + url.search + url.hash, { scroll: false });
    if (error) return setNotice({ kind: "error", text: error.slice(0, 300) });
    const connection = connections.find((c) => c.id === connected);
    if (!connection) return;
    onConnected?.(connection.id);
    setNotice({ kind: "connected", text: `${connectionName(connection)} is connected.` });
    // Runs once, on the address the owner arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!notice) return null;
  return (
    <p className={notice.kind === "error" ? "error connect-notice" : "hint connect-notice"} role={notice.kind === "error" ? "alert" : "status"}>
      {notice.text}{" "}
      <button type="button" className="link" onClick={() => setNotice(null)}>
        Dismiss
      </button>
    </p>
  );
}
