/**
 * What each connector offers, in a form both the editor (to draw its fields)
 * and the server (to validate configs) can read. No fetching, no node imports.
 *
 * Adding a connector:
 *   1. describe it here (metrics, their params, connection fields)
 *   2. implement `Connector` in src/lib/connectors/<id>.ts
 *   3. register it in src/lib/connectors/registry.ts
 * The editor, validation, caching, Pro gating and secret storage follow.
 */

export interface FieldSpec {
  name: string;
  label: string;
  /** `secret` fields are encrypted at rest and never sent back to the browser. */
  type: "text" | "url" | "secret";
  placeholder?: string;
  help?: string;
  optional?: boolean;
  pattern?: { regex: RegExp; message: string };
  maxLength?: number;
}

export interface MetricSpec {
  id: string;
  label: string;
  /** Per-metric settings typed in the editor, e.g. a GitHub username. Public, stored in the config. */
  params: FieldSpec[];
  /** Starting label/prefix/suffix when someone picks this metric. */
  defaults: { label: string; prefix: string; suffix: string };
}

export interface ConnectorSpec {
  id: string;
  label: string;
  /** Live connectors that hold a secret or cost upstream calls are Pro. */
  pro: boolean;
  /** Present when the connector needs credentials saved once per wall, then referenced by metrics. */
  connection?: { fields: FieldSpec[]; help: string; cta: string };
  metrics: MetricSpec[];
}

const githubUser: FieldSpec = {
  name: "user",
  label: "GitHub username",
  type: "text",
  placeholder: "your-github",
  maxLength: 39,
  pattern: { regex: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/, message: "isn't a valid GitHub username" },
};

export const CATALOG = {
  github: {
    id: "github",
    label: "GitHub",
    pro: false,
    metrics: [
      { id: "streak", label: "Commit streak", params: [githubUser], defaults: { label: "day commit streak", prefix: "", suffix: "" } },
      { id: "contributions", label: "Contributions, last 12 months", params: [githubUser], defaults: { label: "contributions this year", prefix: "", suffix: "" } },
      { id: "followers", label: "Followers", params: [githubUser], defaults: { label: "GitHub followers", prefix: "", suffix: "" } },
      {
        id: "stars",
        label: "Repository stars",
        params: [
          {
            name: "repo",
            label: "Repository",
            type: "text",
            placeholder: "owner/name",
            maxLength: 140,
            pattern: { regex: /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, message: "must look like owner/name" },
          },
        ],
        defaults: { label: "GitHub stars", prefix: "", suffix: "" },
      },
    ],
  },
  stripe: {
    id: "stripe",
    label: "Stripe",
    pro: true,
    connection: {
      cta: "Connect Stripe",
      help:
        "Create a restricted key in Stripe (Developers → API keys → Create restricted key) with Read access to Subscriptions, Balance and Coupons, and nothing else. Full secret keys (sk_) are refused.",
      fields: [
        {
          name: "key",
          label: "Restricted key",
          type: "secret",
          placeholder: "rk_live_…",
          pattern: { regex: /^rk_(live|test)_[A-Za-z0-9]{10,}$/, message: "must be a restricted key starting with rk_live_ or rk_test_" },
        },
      ],
    },
    metrics: [
      { id: "mrr", label: "MRR", params: [], defaults: { label: "MRR", prefix: "$", suffix: "" } },
      { id: "revenue30d", label: "Revenue, last 30 days", params: [], defaults: { label: "revenue, last 30 days", prefix: "$", suffix: "" } },
      { id: "subscribers", label: "Active subscriptions", params: [], defaults: { label: "paying customers", prefix: "", suffix: "" } },
    ],
  },
  http: {
    id: "http",
    label: "Your API",
    pro: true,
    connection: {
      cta: "Add an endpoint",
      help:
        "Any HTTPS URL that answers JSON. Point at the number with a path like data.mrr or items[0].count. We fetch it when your wallpaper is drawn, at most every 10 minutes.",
      fields: [
        { name: "url", label: "URL", type: "url", placeholder: "https://api.example.com/stats", maxLength: 2000 },
        {
          name: "path",
          label: "Path to the number",
          type: "text",
          placeholder: "data.mrr",
          maxLength: 200,
          optional: true,
          pattern: { regex: /^[A-Za-z0-9_$\-.[\]]*$/, message: "can only use names, dots and [index]" },
        },
        {
          name: "headerName",
          label: "Header name",
          type: "text",
          placeholder: "Authorization",
          optional: true,
          maxLength: 64,
          pattern: { regex: /^[A-Za-z0-9-]*$/, message: "isn't a valid header name" },
        },
        { name: "headerValue", label: "Header value", type: "secret", placeholder: "Bearer …", optional: true, maxLength: 2000 },
      ],
    },
    metrics: [{ id: "value", label: "Number from the endpoint", params: [], defaults: { label: "", prefix: "", suffix: "" } }],
  },
} as const satisfies Record<string, ConnectorSpec>;

export type ConnectorId = keyof typeof CATALOG;
export const CONNECTOR_IDS = Object.keys(CATALOG) as ConnectorId[];

export function connectorSpec(id: string): ConnectorSpec | null {
  return (CATALOG as Record<string, ConnectorSpec>)[id] ?? null;
}

export function metricSpec(source: string, field: string): MetricSpec | null {
  return connectorSpec(source)?.metrics.find((m) => m.id === field) ?? null;
}

/** Checks values against field specs. Returns the first problem as a sentence, or null. */
export function checkFields(fields: readonly FieldSpec[], values: Record<string, string>): string | null {
  for (const f of fields) {
    const v = (values[f.name] ?? "").trim();
    if (!v) {
      if (f.optional) continue;
      return `${f.label} is required`;
    }
    if (f.maxLength && v.length > f.maxLength) return `${f.label} is too long`;
    if (f.pattern && !f.pattern.regex.test(v)) return `${f.label} ${f.pattern.message}`;
    if (f.type === "url" && !/^https:\/\/[^\s]+$/.test(v)) return `${f.label} must start with https://`;
  }
  return null;
}
