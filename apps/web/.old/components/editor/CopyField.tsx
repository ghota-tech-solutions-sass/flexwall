// Rendered inside the Editor client boundary.
import { useState } from "react";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <span>{label}</span>
      <div className="copy">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button
          type="button"
          className="btn btn-small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* the field is selectable as a fallback */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
