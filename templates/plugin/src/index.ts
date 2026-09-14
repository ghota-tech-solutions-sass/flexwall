import { ConnectorError, defineConnector, definePlugin, field, HttpError, number } from "@flexwall/sdk";
import { __CAMEL__Widget } from "./widget";

/**
 * __NAME__ for Flexwall. Guides: docs/plugins/connectors.md, docs/plugins/widgets.md.
 * Only need a connector? Delete src/widget.tsx, tests/widget.test.tsx and the
 * two lines that mention the widget below.
 */

export const __CAMEL__Connector = defineConnector({
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
      params: [field.text("user", "Username", { placeholder: "someone", maxLength: 64, pattern: "^[A-Za-z0-9_.-]+$", patternMessage: "can only use letters, digits, dots, dashes and underscores" })],
      defaults: { label: "followers" },
      leaderboard: "audience",
    },
  ],

  async fetch({ params }, ctx) {
    try {
      // ctx.fetch is the only network a plugin gets. Encode what the owner typed.
      const profile = await ctx.fetch.json<{ followers: number } | null>(`https://api.example.com/users/${encodeURIComponent(String(params.user))}`);
      if (!profile) throw new ConnectorError(`__NAME__ has no user called ${params.user}.`);
      return { followers: number(profile.followers, { unit: "count" }) };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`__NAME__ has no user called ${params.user}.`);
      throw error;
    }
  },

  sample: { followers: number(1280, { unit: "count" }) },
});

export default definePlugin({
  id: "__ID__",
  name: "__NAME__",
  description: "One sentence about what this plugin adds.",
  author: { name: "Your name", url: "https://github.com/you" },
  connectors: [__CAMEL__Connector],
  widgets: [__CAMEL__Widget],
});

export { __CAMEL__Widget };
