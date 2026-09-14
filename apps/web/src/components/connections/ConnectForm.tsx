"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldValues } from "@flexwall/sdk";
import type { Outcome } from "@/application/editor/ports";
import type { ConnectionView } from "@/domain/connection";
import { catalog } from "@/plugins/registry";
import { FieldInput } from "@/components/forms/FieldInput";

/** The first control of a form, focused when the owner arrives from a tile's Connect button. */
const FIRST_FIELD = "input, textarea, select";

interface Props {
  connectorId: string;
  /** Tests the credentials and saves them. Injected: the editor's store or settings' gateway. */
  connect: (values: FieldValues) => Promise<Outcome<ConnectionView>>;
  onConnected?: (connection: ConnectionView) => void;
  onCancel?: () => void;
  /** Focuses the first field when mounted with a value, and again each time it changes. */
  focusKey?: number;
}

/** A connector's declared auth fields, submitted through whatever `connect` it's given. */
export function ConnectForm({ connectorId, connect, onConnected, onCancel, focusKey }: Props) {
  const connector = catalog.connector(connectorId);
  const [values, setValues] = useState<FieldValues>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusKey !== undefined) form.current?.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
  }, [focusKey]);

  if (!connector?.auth) return null;
  const auth = connector.auth;

  return (
    <form
      ref={form}
      className="connect-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const outcome = await connect(values);
        setBusy(false);
        if (outcome.ok) onConnected?.(outcome.value);
        else setError(outcome.message);
      }}
    >
      <p className="hint">{auth.help}</p>
      {auth.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={values[f.key]}
          onChange={(v) =>
            setValues((cur) => {
              const next = { ...cur };
              if (v === undefined) delete next[f.key];
              else next[f.key] = v;
              return next;
            })
          }
        />
      ))}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn btn-signal btn-small" disabled={busy}>
          {busy ? "Checking…" : (auth.label ?? `Connect ${connector.name}`)}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-small btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
