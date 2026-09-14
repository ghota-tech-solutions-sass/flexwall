import type { ConnectorDef, MetricDef, Theme, WidgetDef } from "@flexwall/sdk";

/**
 * What the domain needs to know about installed plugins. The plugin registry
 * implements it; tests pass a small one built from test plugins.
 */
export interface Catalog {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  widget(id: string): WidgetDef<any> | null;
  connector(id: string): ConnectorDef | null;
  metric(connector: string, metric: string): MetricDef | null;
  theme(id: string): Theme | null;
  defaultTheme(): Theme;
}
