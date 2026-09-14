"use client";

import type { Field, FieldValue } from "@flexwall/sdk";

/** One input for any field a plugin declares. Plugins describe fields; they never ship form code. */
export function FieldInput({ field, value, onChange }: { field: Field; value: FieldValue | undefined; onChange: (v: FieldValue | undefined) => void }) {
  const label = (
    <span>
      {field.label}
      {field.optional ? " (optional)" : ""}
    </span>
  );
  const help = field.help ? <small>{field.help}</small> : null;
  const text = value === undefined ? "" : String(value);

  switch (field.kind) {
    case "toggle":
      return (
        <label className="check">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case "select":
      return (
        <label className="field">
          {label}
          <select value={text || field.default || field.options[0]?.value} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
        </label>
      );
    case "textarea":
      return (
        <label className="field">
          {label}
          <textarea value={text} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
          {help}
        </label>
      );
    case "number":
      return (
        <label className="field">
          {label}
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              const raw = e.target.value.replace(/[\s,]/g, "");
              onChange(raw === "" ? undefined : Number.isFinite(Number(raw)) ? Number(raw) : value);
            }}
          />
          {help}
        </label>
      );
    default:
      return (
        <label className="field">
          {label}
          <input
            type={field.kind === "secret" ? "password" : field.kind === "date" ? "date" : field.kind === "url" ? "url" : "text"}
            value={text}
            placeholder={"placeholder" in field ? field.placeholder : undefined}
            maxLength={"maxLength" in field ? field.maxLength : undefined}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </label>
      );
  }
}
