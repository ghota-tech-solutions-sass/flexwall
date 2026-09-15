"use client";

import { useState } from "react";
import type { Outcome } from "@/application/editor/ports";
import { NICKNAME_MAX } from "@/domain/connection";

interface Props {
  /** The name the owner gave, if any. */
  nickname: string | null | undefined;
  /** What the account is called without one: shown as the placeholder. */
  label: string;
  /** Saves the name; an empty one clears it. Injected: the editor's store or settings' gateway. */
  save: (nickname: string | null) => Promise<Outcome<unknown>>;
  /** Called once saved or cancelled. */
  onDone: () => void;
}

/** Names an account in place: Enter saves, Escape cancels. */
export function RenameField({ nickname, label, save, onDone }: Props) {
  const [value, setValue] = useState(nickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await save(value.trim() || null);
    setBusy(false);
    if (outcome.ok) onDone();
    else setError(outcome.message);
  };

  return (
    <form
      className="rename-field"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="rename-field-row">
        <input
          autoFocus
          value={value}
          maxLength={NICKNAME_MAX}
          placeholder={label}
          aria-label={`Name for ${label}`}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Escape closes this field only, not the panel or tile around it.
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }}
        />
        <button type="submit" className="btn btn-signal btn-small" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-small btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        <small className="rename-field-hint">Leave empty to use “{label}”.</small>
      )}
    </form>
  );
}
