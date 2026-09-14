import type { ConnectorDef, ValueType, WidgetDef } from "@flexwall/sdk";
import { inSentence, clip } from "./descriptions";
import { ROUTES } from "../routes";

/** What an integration page says about a connector, built from the connector itself so pages can't drift from the code. */
export interface IntegrationPage {
  id: string;
  name: string;
  path: string;
  /** <title>, shaped like what people search. */
  title: string;
  description: string;
  headline: string;
  verified: boolean;
  pro: boolean;
  measures: { id: string; name: string; description: string | null; kind: string }[];
  /** Null for public data that needs no account. */
  credentials: { fields: string[]; help: string } | null;
  widgets: { id: string; name: string }[];
}

const KINDS: Record<ValueType, string> = {
  number: "A number",
  series: "A chart over time",
  calendar: "A daily calendar",
  text: "Text",
};

export function integrationPath(connectorId: string): string {
  return ROUTES.integration(connectorId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function integrationPage(connector: ConnectorDef, widgets: readonly WidgetDef<any>[]): IntegrationPage {
  const names = connector.metrics.map((m) => m.name);
  // "Revenue, last 30 days" reads "revenue" in a title.
  const lead = [...new Set(names.map((n) => inSentence(n.split(",")[0]!)))].slice(0, 2);
  const leadList = lead.length === 2 ? `${lead[0]} and ${lead[1]}` : (lead[0] ?? "numbers");
  const types = new Set(connector.metrics.map((m) => m.type));
  // A number metric can also be charted from its daily history.
  if (types.has("number")) types.add("series");
  return {
    id: connector.id,
    name: connector.name,
    path: integrationPath(connector.id),
    title: `${connector.name} widget: ${leadList} on a public page`,
    description: clip(
      `Show your ${connector.name} ${leadList} as live tiles on a public page, a share card and your iPhone lock screen. ` +
        (connector.verified ? "Read from your own account, with a verified badge." : "Public data, no account to connect."),
      180
    ),
    headline: `Your ${connector.name} numbers, live on one page`,
    verified: connector.verified,
    pro: connector.tier === "pro",
    measures: connector.metrics.map((m) => ({ id: m.id, name: m.name, description: m.description ?? null, kind: KINDS[m.type] })),
    credentials: connector.auth ? { fields: connector.auth.fields.map((f) => f.label), help: connector.auth.help } : null,
    widgets: widgets.filter((w) => w.inputs.some((input) => input.accepts.some((t) => types.has(t)))).map((w) => ({ id: w.id, name: w.name })),
  };
}
