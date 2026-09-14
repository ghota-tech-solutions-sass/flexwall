"use client";

import { useState } from "react";
import type { FieldValues } from "@flexwall/sdk";
import type { ConnectionView } from "@/domain/connection";
import { catalog } from "@/plugins/registry";
import { FieldInput } from "@/components/forms/FieldInput";

/** Accounts connected once and used by any tile. Forms come from each connector's declared auth fields. */
export function ConnectionsManager({ initial, paid }: { initial: ConnectionView[]; paid: boolean }) {
  const [connections, setConnections] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const authConnectors = catalog.connectors().filter((c) => c.auth);

  return (
    <section className="panel" aria-labelledby="connections">
      <h2 id="connections">Connections</h2>
      <p>Credentials are encrypted and never shown again, not even to you. Use read-only keys.</p>
      {connections.length ? (
        <ul className="conn-list">
          {connections.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.label}</strong> {c.public.hint ? <span className="mono">{c.public.hint}</span> : null}
              </span>
              <button
                type="button"
                className="link"
                onClick={async () => {
                  const res = await fetch(`/api/connections/${c.id}`, { method: "DELETE" });
                  if (res.ok) setConnections((list) => list.filter((x) => x.id !== c.id));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No accounts connected yet.</p>
      )}
      <div className="row">
        {authConnectors.map((c) => (
          <button key={c.id} type="button" className="btn btn-small" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
            {c.auth!.label ?? `Connect ${c.name}`} {c.tier === "pro" && !paid ? <span className="badge">Pro</span> : null}
          </button>
        ))}
      </div>
      {open ? <ConnectForm key={open} connectorId={open} onConnected={(c) => (setConnections((list) => [...list.filter((x) => x.id !== c.id), c]), setOpen(null))} /> : null}
    </section>
  );
}

function ConnectForm({ connectorId, onConnected }: { connectorId: string; onConnected: (c: ConnectionView) => void }) {
  const connector = catalog.connector(connectorId)!;
  const [values, setValues] = useState<FieldValues>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="connect-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connector: connectorId, values }) });
        const body = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return setError(body.message ?? "Couldn't connect.");
        onConnected(body.connection);
      }}
    >
      <p className="hint">{connector.auth!.help}</p>
      {connector.auth!.fields.map((f) => (
        <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues((cur) => { const next = { ...cur }; if (v === undefined) delete next[f.key]; else next[f.key] = v; return next; })} />
      ))}
      <div className="row">
        <button type="submit" className="btn btn-signal btn-small" disabled={busy}>
          {busy ? "Testing…" : "Test and save"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
