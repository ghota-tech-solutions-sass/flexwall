"use client";

import { useState } from "react";
import type { ConnectionView } from "@/domain/connection";
import { catalog } from "@/plugins/registry";
import { ConnectForm } from "@/components/connections/ConnectForm";
import { accountsGateway } from "@/presentation/editor/composition";

/** Accounts connected once and used by any tile. Forms come from each connector's declared auth fields. */
export function ConnectionsManager({ initial, paid }: { initial: ConnectionView[]; paid: boolean }) {
  const [gateway] = useState(accountsGateway);
  const [connections, setConnections] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
                  setError(null);
                  const outcome = await gateway.removeAccount(c.id);
                  if (outcome.ok) setConnections((list) => list.filter((x) => x.id !== c.id));
                  else setError(outcome.message);
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
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        {authConnectors.map((c) => (
          <button key={c.id} type="button" className="btn btn-small" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
            {c.auth?.label ?? `Connect ${c.name}`} {c.tier === "pro" && !paid ? <span className="badge">Pro</span> : null}
          </button>
        ))}
      </div>
      {open ? (
        <ConnectForm
          key={open}
          connectorId={open}
          connect={(values) => gateway.connectAccount(open, values)}
          onConnected={(c) => {
            setConnections((list) => [...list.filter((x) => x.id !== c.id), c]);
            setOpen(null);
          }}
        />
      ) : null}
    </section>
  );
}
