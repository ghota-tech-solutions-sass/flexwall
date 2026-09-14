import { ConnectorError, defineConnector, definePlugin, defineWidget, field, HttpError, number } from "@flexwall/sdk";
import { Col, Text, fitFont } from "@flexwall/sdk/ui";

/**
 * __NAME__. A plugin can ship connectors, widgets and themes; keep what you
 * need and delete the rest. Guides: docs/plugins/connectors.md and
 * docs/plugins/widgets.md.
 */

// A connector: where values come from.
const __CAMEL__Connector = defineConnector({
  id: "__ID__",
  name: "__NAME__",
  description: "What this connector reads, in one sentence.",
  homepage: "https://example.com",
  tier: "free",
  verified: false,
  ttl: 3600,
  metrics: [
    {
      id: "followers",
      name: "Followers",
      type: "number",
      unit: "count",
      params: [field.text("user", "Username", { placeholder: "someone", maxLength: 64, pattern: "^[A-Za-z0-9_.-]+$", patternMessage: "isn't a valid username" })],
      defaults: { label: "followers" },
      leaderboard: "audience",
    },
  ],

  async fetch({ params }, ctx) {
    try {
      // Always ctx.fetch: it's the only network a plugin gets.
      const profile = await ctx.fetch.json<{ followers: number }>(`https://api.example.com/users/${encodeURIComponent(String(params.user))}`);
      return { followers: number(profile.followers, { unit: "count" }) };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`__NAME__ has no user called ${params.user}.`);
      throw error;
    }
  },

  sample: { followers: number(1280, { unit: "count" }) },
});

// A widget: how values are shown. Delete it if your plugin only adds a connector.
const __CAMEL__Widget = defineWidget<{ label: string }>({
  id: "__ID__-big-number",
  name: "__NAME__ number",
  description: "One number, as big as the tile allows.",
  category: "numbers",
  inputs: [{ key: "value", label: "Number", accepts: ["number"] }],
  options: [field.text("label", "Label", { maxLength: 40, optional: true })],
  size: { default: [1, 1], min: [1, 1], max: [2, 2] },

  render({ inputs, options, area, theme, u }) {
    const value = inputs.value!.value;
    const shown = value.type === "number" ? value.value.toLocaleString("en-US") : "–";
    return (
      <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
        <Text style={{ fontSize: u(11), color: theme.muted }}>{options.label || " "}</Text>
        <Text style={{ fontSize: u(fitFont(shown, area.width, area.height * 0.6)), color: theme.ink, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>
          {shown}
        </Text>
      </Col>
    );
  },
});

export default definePlugin({
  id: "__ID__",
  name: "__NAME__",
  description: "One sentence about what this plugin adds.",
  author: { name: "Your name", url: "https://github.com/you" },
  connectors: [__CAMEL__Connector],
  widgets: [__CAMEL__Widget],
});

export { __CAMEL__Connector, __CAMEL__Widget };
