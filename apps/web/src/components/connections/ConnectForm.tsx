"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldValues } from "@flexwall/sdk";
import type { ConnectionView } from "@/domain/connection";
import { catalog } from "@/plugins/registry";
import { FieldInput } from "@/components/forms/FieldInput";

interface Props {
  connectorId: string;
  onConnected: (c: ConnectionView) => void;
  onCancel?: () => void;
  /** Focus the first field when mounted or when this changes. */
  focusKey?: number;
}

/** Tests credentials against the connector and saves them. Fields come from the connector's declared auth. */
export function ConnectForm({ connectorId, onConnected, onCancel, focusKey }: Props) {
  const connector = catalog.connector(connectorId)!;
  const [values, setValues] = useState<FieldValues>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusKey !== undefined) form.current?.querySelector<HTMLInputElement>("input, textarea, select")?.focus({ preventScroll: false });
  }, [focusKey]);

  return (
    <form
      ref={form}
      className="connect-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connector: connectorId, values }) }).catch(() => null);
        const body = await res?.json().catch(() => ({}));
        setBusy(false);
        if (!res?.ok) return setError(body?.message ?? "Couldn't reach the server. Try again.");
        onConnected(body.connection);
      }}
    >
      <p className="hint">{connector.auth!.help}</p>
      {connector.auth!.fields.map((f) => (
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
          {busy ? "Checking…" : connector.auth!.label ?? `Connect ${connector.name}`}
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
