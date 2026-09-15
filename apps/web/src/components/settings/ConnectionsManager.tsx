"use client";

import { useRef, useState } from "react";
import type { TileRef } from "@/application/editor/draft";
import type { Outcome } from "@/application/editor/ports";
import { connectionDetail, credentialsState, disambiguate, type ConnectionView } from "@/domain/connection";
import { catalog } from "@/plugins/registry";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { ConnectForm } from "@/components/connections/ConnectForm";
import { ConnectNotice } from "@/components/connections/ConnectNotice";
import { ConnectorPicker } from "@/components/connections/ConnectorPicker";
import { RenameField } from "@/components/connections/RenameField";
import { KeyIcon, PlusIcon } from "@/components/editor/icons";
import { credentialsLine, groupByConnector, removalWarning, usageLine } from "@/presentation/connections";
import { accountsGateway } from "@/presentation/editor/composition";
import { ROUTES } from "@/presentation/routes";

const connectorName = (id: string) => catalog.connector(id)?.name;
const formatDate = (epochMs: number) => new Date(epochMs).toLocaleDateString();

/** Adding a connection: closed, choosing a connector, or filling one's form. */
type Adding = { step: "closed" } | { step: "choose" } | { step: "form"; connectorId: string };

/** Accounts connected once and used by any tile, grouped by provider. Forms come from each connector's declared auth fields. */
export function ConnectionsManager({ initial, paid, usage, now }: { initial: ConnectionView[]; paid: boolean; usage: Record<string, TileRef[]>; now: number }) {
  const [gateway] = useState(accountsGateway);
  const [connections, setConnections] = useState(initial);
  const [adding, setAdding] = useState<Adding>({ step: "closed" });
  const addRef = useRef<HTMLDivElement>(null);
  const names = disambiguate(connections, connectorName);
  const groups = groupByConnector(connections, connectorName);

  const reconnect = (connectorId: string) => {
    setAdding({ step: "form", connectorId });
    addRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <section className="panel" aria-labelledby="connections">
      <h2 id="connections">Connections</h2>
      <p>Credentials are encrypted and never shown again, not even to you. Use read-only keys.</p>
      <ConnectNotice connections={connections} />
      {groups.length ? (
        <div className="conn-groups">
          {groups.map((group) => (
            <section key={group.connector} className="conn-group" aria-label={group.name}>
              <h3>
                {group.name}
                {group.connections.length > 1 ? <span className="badge">{group.connections.length} accounts</span> : null}
              </h3>
              <ul className="conn-list">
                {group.connections.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    connection={c}
                    name={names[c.id] ?? c.label}
                    used={usage[c.id] ?? []}
                    now={now}
                    rename={async (nickname) => {
                      const outcome = await gateway.renameAccount(c.id, nickname);
                      if (outcome.ok) setConnections((list) => list.map((x) => (x.id === c.id ? outcome.value : x)));
                      return outcome;
                    }}
                    remove={async () => {
                      const outcome = await gateway.removeAccount(c.id);
                      if (outcome.ok) setConnections((list) => list.filter((x) => x.id !== c.id));
                      return outcome;
                    }}
                    onReconnect={() => reconnect(c.connector)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="hint">No accounts connected yet. Connect one here or from any tile that needs it.</p>
      )}

      <div className="conn-add" ref={addRef}>
        {adding.step === "closed" ? (
          <button type="button" className="btn btn-small" onClick={() => setAdding({ step: "choose" })}>
            <PlusIcon size={14} /> Add a connection
          </button>
        ) : adding.step === "choose" ? (
          <>
            <div className="conn-add-head">
              <h3>Add a connection</h3>
              <button type="button" className="btn btn-small btn-quiet" onClick={() => setAdding({ step: "closed" })}>
                Cancel
              </button>
            </div>
            <ConnectorPicker paid={paid} onPick={(connectorId) => setAdding({ step: "form", connectorId })} />
          </>
        ) : (
          <>
            <div className="conn-add-head">
              <span className="conn-mark">{hasMark(adding.connectorId) ? <BrandMark id={adding.connectorId} size={18} /> : <KeyIcon size={18} />}</span>
              <h3>Connect {connectorName(adding.connectorId) ?? adding.connectorId}</h3>
            </div>
            <ConnectForm
              key={adding.connectorId}
              connectorId={adding.connectorId}
              focusKey={0}
              connect={(values) => gateway.connectAccount(adding.connectorId, values)}
              signIn={(values) => gateway.startSignIn(adding.connectorId, values, ROUTES.settings)}
              onConnected={(c) => {
                setConnections((list) => [...list.filter((x) => x.id !== c.id), c]);
                setAdding({ step: "closed" });
              }}
              onCancel={() => setAdding({ step: "choose" })}
            />
          </>
        )}
      </div>
    </section>
  );
}

type Mode = "idle" | "renaming" | "confirming";

function ConnectionRow({
  connection,
  name,
  used,
  now,
  rename,
  remove,
  onReconnect,
}: {
  connection: ConnectionView;
  name: string;
  used: TileRef[];
  now: number;
  rename: (nickname: string | null) => Promise<Outcome<ConnectionView>>;
  remove: () => Promise<Outcome<void>>;
  onReconnect: () => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connector = catalog.connector(connection.connector);
  const detail = connectionDetail(connection);
  const credentials = credentialsLine(credentialsState(connection, Boolean(connector?.auth?.oauth?.refresh), now), formatDate);
  const tileNames = used.map((t) => t.name).join(", ");

  return (
    <li className="conn-row" data-mode={mode}>
      <span className="conn-mark">{hasMark(connection.connector) ? <BrandMark id={connection.connector} size={18} /> : <KeyIcon size={18} />}</span>
      <div className="conn-main">
        {mode === "renaming" ? (
          <RenameField nickname={connection.nickname} label={connection.label} save={rename} onDone={() => setMode("idle")} />
        ) : (
          <>
            <strong className="conn-name">{name}</strong>
            {detail ? <span className="conn-detail">{detail}</span> : null}
          </>
        )}
        <span className="conn-meta">
          <span className="conn-usage" title={tileNames || undefined}>
            {usageLine(used)}
            {tileNames ? <span className="conn-tiles">: {tileNames}</span> : null}
          </span>
          {credentials ? (
            <span className="conn-credentials" data-tone={credentials.tone}>
              {credentials.text}
              {credentials.reconnect ? (
                <>
                  {" "}
                  <button type="button" className="link" onClick={onReconnect}>
                    Reconnect
                  </button>
                </>
              ) : null}
            </span>
          ) : null}
        </span>
        {mode === "confirming" ? <p className="conn-warning">{removalWarning(used)}</p> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {mode === "renaming" ? null : (
        <div className="conn-actions">
          {mode === "confirming" ? (
            <>
              <button
                type="button"
                className="btn btn-small btn-danger"
                aria-label={`Remove ${name} for good`}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const outcome = await remove();
                  setBusy(false);
                  if (!outcome.ok) setError(outcome.message);
                }}
              >
                {busy ? "Removing…" : "Remove"}
              </button>
              <button type="button" className="btn btn-small btn-quiet" onClick={() => setMode("idle")}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-small btn-quiet" aria-label={`Rename ${name}`} onClick={() => (setError(null), setMode("renaming"))}>
                Rename
              </button>
              <button type="button" className="btn btn-small btn-quiet" aria-label={`Remove ${name}`} onClick={() => (setError(null), setMode("confirming"))}>
                Remove
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
