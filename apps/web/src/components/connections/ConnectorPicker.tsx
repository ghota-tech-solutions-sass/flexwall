"use client";

import { useId, useState } from "react";
import { catalog } from "@/plugins/registry";
import { BrandMark, hasMark } from "@/components/brand/Logos";
import { KeyIcon, SearchIcon } from "@/components/editor/icons";
import { searchConnectors } from "@/presentation/connections";

/** Every connector that takes an account, searchable by name or what it measures. */
export function ConnectorPicker({ paid, onPick }: { paid: boolean; onPick: (connectorId: string) => void }) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const shown = searchConnectors(catalog.connectors(), query);

  return (
    <div className="conn-picker">
      <label className="conn-search">
        <SearchIcon size={16} />
        <input
          type="search"
          value={query}
          placeholder="Search Stripe, GitHub, a bank…"
          aria-label="Search connectors"
          aria-controls={listId}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              e.preventDefault();
              onPick(shown[0].id);
            }
          }}
        />
      </label>
      <div className="conn-picker-list" id={listId} aria-live="polite">
        {shown.length === 0 ? <p className="hint">No connector matches “{query}”.</p> : null}
        {shown.map((c) => (
          <button key={c.id} type="button" className="conn-picker-item" onClick={() => onPick(c.id)}>
            <span className="conn-mark small">{hasMark(c.id) ? <BrandMark id={c.id} size={16} /> : <KeyIcon size={16} />}</span>
            <span className="conn-picker-text">
              <strong>
                {c.name}
                {c.tier === "pro" && !paid ? <span className="badge">Pro</span> : null}
              </strong>
              <small>{c.description}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
