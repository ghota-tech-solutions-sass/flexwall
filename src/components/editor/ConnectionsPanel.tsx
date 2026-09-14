// Rendered inside the Editor client boundary.
import { useState } from "react";
import { CATALOG, CONNECTOR_IDS, checkFields, type ConnectorSpec } from "@/lib/connectors/catalog";
import type { WallView } from "@/lib/site";

type Api = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Credentials for connectors that need them, drawn from each connector's
 * catalog entry. Secrets go up once and never come back: the list only shows
 * what the connector chose to make public.
 */
export function ConnectionsPanel({ wall, api, onWall }: { wall: WallView; api: Api; onWall: (w: WallView) => void }) {
  const withConnections = CONNECTOR_IDS.map((id) => CATALOG[id] as ConnectorSpec).filter((c) => c.connection);
  const [open, setOpen] = useState<string | null>(null);

  async function remove(id: string) {
    const res = await api(`/api/walls/${wall.id}/connections/${id}`, { method: "DELETE" });
    if (res.ok) onWall(await res.json());
  }

  return (
    <section className="panel" aria-labelledby="p-conn">
      <h2 id="p-conn">Connections</h2>
      <p>Live numbers from your accounts. Keys are encrypted and never shown again, not even to you.</p>

      {wall.connections.length > 0 ? (
        <ul className="conn-list">
          {wall.connections.map((c) => (
            <li key={c.id}>
              <div>
                <b>{c.label}</b>
                {c.public.hint ? <span className="mono"> {c.public.hint}</span> : null}
              </div>
              <button type="button" className="link-btn" onClick={() => remove(c.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="row" style={{ marginTop: 8 }}>
        {withConnections.map((c) => (
          <button key={c.id} type="button" className="btn btn-small" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
            {c.connection!.cta}
          </button>
        ))}
      </div>

      {open ? (
        <ConnectForm
          key={open}
          spec={CATALOG[open as keyof typeof CATALOG] as ConnectorSpec}
          onConnect={async (input) => {
            const res = await api(`/api/walls/${wall.id}/connections`, { method: "POST", body: JSON.stringify({ source: open, input }) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return body.message ?? "Couldn't connect. Try again.";
            onWall(body.wall);
            setOpen(null);
            return null;
          }}
        />
      ) : null}
    </section>
  );
}

function ConnectForm({ spec, onConnect }: { spec: ConnectorSpec; onConnect: (input: Record<string, string>) => Promise<string | null> }) {
  const fields = spec.connection!.fields;
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="connect-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const problem = checkFields(fields, values);
        if (problem) return setError(problem + ".");
        setBusy(true);
        setError(await onConnect(values));
        setBusy(false);
      }}
    >
      <p className="hint">{spec.connection!.help}</p>
      <div className="row">
        {fields.map((f) => (
          <label key={f.name} className={`field${f.type === "url" ? " wide" : ""}`}>
            <span>
              {f.label}
              {f.optional ? " (optional)" : ""}
            </span>
            <input
              type={f.type === "secret" ? "password" : f.type === "url" ? "url" : "text"}
              value={values[f.name] ?? ""}
              placeholder={f.placeholder}
              maxLength={f.maxLength}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="row" style={{ alignItems: "center", marginTop: 12 }}>
        <button type="submit" className="btn btn-signal btn-small" disabled={busy}>
          {busy ? "Testing…" : `Test and save`}
        </button>
      </div>
      {error ? <p className="status error">{error}</p> : null}
    </form>
  );
}
