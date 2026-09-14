/**
 * Declarative form fields. Connectors use them for credentials and metric
 * params, widgets for their options. The editor draws the forms, the host
 * validates with `validateFields`, and plugins never write UI code for it.
 */

export type FieldValue = string | number | boolean;
export type FieldValues = Record<string, FieldValue>;

interface BaseField {
  key: string;
  label: string;
  help?: string;
  optional?: boolean;
}

export interface TextField extends BaseField {
  kind: "text";
  placeholder?: string;
  default?: string;
  maxLength?: number;
  /** Source of a RegExp, so fields stay serializable. Matched against the trimmed value. */
  pattern?: string;
  patternMessage?: string;
}

export interface TextareaField extends BaseField {
  kind: "textarea";
  placeholder?: string;
  default?: string;
  maxLength?: number;
}

/** Encrypted at rest by the host, never sent back to a browser. Connector auth only. */
export interface SecretField extends BaseField {
  kind: "secret";
  placeholder?: string;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
}

export interface UrlField extends BaseField {
  kind: "url";
  placeholder?: string;
  default?: string;
}

export interface NumberField extends BaseField {
  kind: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface DateField extends BaseField {
  kind: "date";
  default?: string;
  /** A default relative to the day the field is filled in, e.g. 30 for "a month from now". */
  defaultInDays?: number;
}

export interface SelectField extends BaseField {
  kind: "select";
  options: { value: string; label: string }[];
  default?: string;
}

export interface ToggleField extends BaseField {
  kind: "toggle";
  default?: boolean;
}

export type Field = TextField | TextareaField | SecretField | UrlField | NumberField | DateField | SelectField | ToggleField;
export type FieldKind = Field["kind"];

type Opts<F extends Field> = Omit<F, "kind" | "key" | "label">;

export const field = {
  text: (key: string, label: string, o: Opts<TextField> = {}): TextField => ({ kind: "text", key, label, ...o }),
  textarea: (key: string, label: string, o: Opts<TextareaField> = {}): TextareaField => ({ kind: "textarea", key, label, ...o }),
  secret: (key: string, label: string, o: Opts<SecretField> = {}): SecretField => ({ kind: "secret", key, label, ...o }),
  url: (key: string, label: string, o: Opts<UrlField> = {}): UrlField => ({ kind: "url", key, label, ...o }),
  number: (key: string, label: string, o: Opts<NumberField> = {}): NumberField => ({ kind: "number", key, label, ...o }),
  date: (key: string, label: string, o: Opts<DateField> = {}): DateField => ({ kind: "date", key, label, ...o }),
  select: (key: string, label: string, options: SelectField["options"], o: Omit<Opts<SelectField>, "options"> = {}): SelectField => ({
    kind: "select",
    key,
    label,
    options,
    ...o,
  }),
  toggle: (key: string, label: string, o: Opts<ToggleField> = {}): ToggleField => ({ kind: "toggle", key, label, ...o }),
};

/** Default values for a set of fields, for a new tile or a new form. `today` (YYYY-MM-DD) resolves relative dates. */
export function defaultsFor(fields: readonly Field[], today = new Date().toISOString().slice(0, 10)): FieldValues {
  const out: FieldValues = {};
  for (const f of fields) {
    if ("default" in f && f.default !== undefined) out[f.key] = f.default;
    else if (f.kind === "date" && f.defaultInDays !== undefined) {
      const d = new Date(today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + f.defaultInDays);
      out[f.key] = d.toISOString().slice(0, 10);
    } else if (f.kind === "toggle") out[f.key] = false;
  }
  return out;
}

export interface ValidationResult {
  values: FieldValues;
  /** First problem, as a sentence to show next to the form. */
  error: string | null;
}

/**
 * Coerces raw form input to typed values and checks every rule. Unknown keys
 * are dropped, so a plugin only ever sees the fields it declared.
 */
export function validateFields(fields: readonly Field[], raw: Record<string, unknown>): ValidationResult {
  const values: FieldValues = {};
  for (const f of fields) {
    const input = raw[f.key];
    const empty = input === undefined || input === null || (typeof input === "string" && input.trim() === "");
    if (empty) {
      if (f.kind === "toggle") {
        values[f.key] = false;
        continue;
      }
      if ("default" in f && f.default !== undefined) {
        values[f.key] = f.default;
        continue;
      }
      if (f.optional) continue;
      return { values, error: `${f.label} is required.` };
    }
    switch (f.kind) {
      case "number": {
        const n = typeof input === "number" ? input : Number(String(input).replace(/[\s,_]/g, ""));
        if (!Number.isFinite(n)) return { values, error: `${f.label} must be a number.` };
        if (f.min !== undefined && n < f.min) return { values, error: `${f.label} must be at least ${f.min}.` };
        if (f.max !== undefined && n > f.max) return { values, error: `${f.label} must be at most ${f.max}.` };
        values[f.key] = n;
        break;
      }
      case "toggle":
        values[f.key] = input === true || input === "true";
        break;
      case "select": {
        const v = String(input);
        if (!f.options.some((o) => o.value === v)) return { values, error: `${f.label} isn't one of the choices.` };
        values[f.key] = v;
        break;
      }
      case "date": {
        const v = String(input).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return { values, error: `${f.label} must be a date.` };
        values[f.key] = v;
        break;
      }
      case "url": {
        const v = String(input).trim();
        if (!/^https:\/\/\S+$/.test(v) || v.length > 2000) return { values, error: `${f.label} must be an https:// address.` };
        values[f.key] = v;
        break;
      }
      default: {
        const v = String(input).trim();
        // Secrets default high: many API keys are long JWTs.
        const max = f.maxLength ?? (f.kind === "textarea" ? 2000 : f.kind === "secret" ? 4000 : 500);
        if (v.length > max) return { values, error: `${f.label} is too long (${max} characters at most).` };
        if ((f.kind === "text" || f.kind === "secret") && f.pattern && !new RegExp(f.pattern).test(v)) {
          return { values, error: `${f.label} ${f.patternMessage ?? "isn't in the expected format"}.` };
        }
        values[f.key] = v;
      }
    }
  }
  return { values, error: null };
}

/** Splits validated values into what the host must encrypt and what it may show. */
export function splitSecrets(fields: readonly Field[], values: FieldValues): { secret: Record<string, string>; visible: FieldValues } {
  const secret: Record<string, string> = {};
  const visible: FieldValues = {};
  for (const f of fields) {
    if (!(f.key in values)) continue;
    if (f.kind === "secret") secret[f.key] = String(values[f.key]);
    else visible[f.key] = values[f.key];
  }
  return { secret, visible };
}
