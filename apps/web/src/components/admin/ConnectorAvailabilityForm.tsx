"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AVAILABILITIES, type Availability } from "@/domain/connector-policy";
import { AVAILABILITY_LABELS } from "@/presentation/admin";
import { sendJson } from "@/presentation/json";
import { API } from "@/presentation/routes";

/**
 * Who may use one connector. "Everyone" is off the table while the server has
 * no credentials for it, or while its credentials point at a sandbox: the
 * server's own state beats what an administrator would like.
 */
export function ConnectorAvailabilityForm({ connectorId, chosen, locked }: { connectorId: string; chosen: Availability; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (availability: Availability) => {
    setBusy(true);
    setError(null);
    const answer = await sendJson("POST", API.adminConnectors, { connectorId, availability });
    setBusy(false);
    if (!answer.ok) return setError(answer.body.message ?? "That didn't work. Try again.");
    router.refresh();
  };

  return (
    <div className="admin-actions">
      <label className="field">
        <select aria-label={`Who may use ${connectorId}`} value={chosen} disabled={busy} onChange={(e) => choose(e.target.value as Availability)}>
          {AVAILABILITIES.map((a) => (
            <option key={a} value={a} disabled={locked && a === "everyone"}>
              {AVAILABILITY_LABELS[a]}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
