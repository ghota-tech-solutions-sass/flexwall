# Writing a connector

A connector declares **metrics** and knows how to **fetch** them. The host does
everything else: forms, validation, encrypting credentials, caching, grouping
requests, deadlines, stale fallbacks, plan gating, daily history.

```ts
import { ConnectorError, defineConnector, field, HttpError, number } from "@flexwall/sdk";

export const npm = defineConnector({
  id: "npm",
  name: "npm",
  description: "Weekly downloads of a package.",
  homepage: "https://www.npmjs.com",
  tier: "free",
  verified: false,
  ttl: 6 * 3600,
  metrics: [
    {
      id: "weekly-downloads",
      name: "Weekly downloads",
      type: "number",
      unit: "count",
      params: [field.text("package", "Package", { placeholder: "react", pattern: "^(@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$", patternMessage: "isn't a package name" })],
      defaults: { label: "weekly downloads" },
      leaderboard: "audience",
    },
  ],

  async fetch({ params }, ctx) {
    try {
      const body = await ctx.fetch.json<{ downloads: number }>(`https://api.npmjs.org/downloads/point/last-week/${params.package}`);
      return { "weekly-downloads": number(body.downloads, { unit: "count" }) };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new ConnectorError(`npm has no package called ${params.package}.`);
      throw error;
    }
  },

  sample: { "weekly-downloads": number(48210, { unit: "count" }) },
});
```

## The definition

| Field | Meaning |
|---|---|
| `id` | Unique across all plugins: lowercase, digits, dashes. Stored in walls, never change it. |
| `tier` | `"free"` or `"pro"`. Pro connectors render on public walls only for paying owners. Use Pro for verified revenue and for anything costly to run. |
| `verified` | `true` only when values come from **the owner's own authenticated account**. Earns the verified badge and a place on revenue leaderboards. Requires `auth`. |
| `auth` | Credentials typed once per account. Omit for public data. |
| `metrics` | What tiles can show. See below. |
| `ttl` | Seconds a value stays fresh. Minimum 60. Think about the upstream's rate limits and how often the number really changes. |
| `cacheKey` | Groups metrics that one request answers. See below. |
| `fetch` | Returns values for the requested metrics. |
| `connect` | Tests credentials and splits them into secret and public parts. Required with `auth`. |
| `sample` | A plausible value for every metric, used by previews and marketing. |

### Metrics

```ts
{ id, name, type: "number" | "series" | "calendar" | "text", unit?, params?, defaults?, leaderboard? }
```

- `params` are per-tile settings (a repository, a package name). They're public and stored in the wall.
- `defaults.label` becomes the tile's label when someone picks the metric.
- `leaderboard` enters the metric in an Explore ranking: `"revenue"`, `"streak"`, `"audience"`, `"stars"`.
- Number metrics get **history for free**: the host records one reading a day and can feed a trend widget.

### Values

Build them with the SDK helpers so units travel with the number:

```ts
number(1613, { unit: "count" })
money(4820, "usd")                       // unit currency, lowercase ISO code
series(points, { unit: "currency", currency: "usd" })
calendar(days)                           // [{ date, count, level 0–4 }]
text("Shipping v2")
```

Return `null` for a metric the upstream has no answer for. Unknown keys and
malformed values are dropped by the host.

## Fetching

```ts
fetch(req: { metrics, params, secret, public }, ctx: { fetch, today, env, log })
```

- `metrics`: every metric of this cache group some tile needs. Return as many as your request answers.
- `secret`: the decrypted credentials, or `null` for public connectors.
- `ctx.fetch.json(url, init?)` / `ctx.fetch.text(url, init?)`: the only network you get.
- `ctx.today`: the owner's date (YYYY-MM-DD), for anything "today" or "this week".
- `ctx.env(name)`: server configuration the host chose to share (for example `GITHUB_TOKEN`). Undefined otherwise.

### Grouping requests with `cacheKey`

By default each metric+params pair is its own group: one request per tile.
When one request answers several metrics, say so:

```ts
// Stripe: one pass over the account answers every metric
cacheKey: () => "account",

// GitHub: the calendar page answers streak, contributions and graph for a user
cacheKey: ({ metric, params }) => (metric === "stars" ? `repo:${params.repo}` : `calendar:${params.user}`),
```

The host adds the connector and connection to the key, and makes sure a group
is fetched once even when ten tiles need it at the same moment.

## Credentials

```ts
auth: {
  label: "Connect Lemon Squeezy",
  help: "In Lemon Squeezy, Settings → API → New key. Read access is enough.",
  fields: [field.secret("key", "API key", { pattern: "^eyJ", patternMessage: "looks like a Lemon Squeezy API key" })],
},

async connect(input, ctx) {
  const me = await ctx.fetch.json<{ data: { attributes: { name: string } } }>("https://api.lemonsqueezy.com/v1/users/me", {
    headers: { Authorization: `Bearer ${input.key}`, Accept: "application/vnd.api+json" },
  });
  return {
    secret: { key: String(input.key) },
    public: { hint: `…${String(input.key).slice(-4)}` },
    label: `Lemon Squeezy (${me.data.attributes.name})`,
    accountId: "…",   // lets reconnecting replace the old connection instead of duplicating it
  };
},
```

- `secret` fields are encrypted with AES-256-GCM and handed back to `fetch` only. They never reach a browser.
- `public` is what the owner sees in their connection list. Never put secrets there.
- Make the test request in `connect`, so a wrong key fails when it's typed, not at 7 in the morning on someone's lock screen.

## Rules

These are checked in review. A connector that breaks one isn't merged.

1. **All network goes through `ctx.fetch`.** Never `fetch`, `node:http(s)` or an SDK that opens its own connections. `ctx.fetch` refuses private and cloud metadata addresses at connect time, refuses redirects and caps size and time; the server Flexwall runs on can mint credentials from its metadata server, and this is what keeps a URL from reaching it.
2. **Least privilege.** Ask for read-only credentials. If a provider has restricted keys, refuse full ones (the Stripe connector refuses `sk_` keys).
3. **Secrets only through `connect()`'s `secret`.** Not in `public`, not in labels, not in error messages, not in logs.
4. **Errors people can act on.** Throw `ConnectorError("One plain sentence.")` for anything the owner can fix: wrong key, missing permission, unknown user. Let other errors through; the host shows a neutral placeholder and keeps the last good value.
5. **Be kind to upstreams.** Pick a `ttl` that respects their limits. Batch with `cacheKey`. Paginate with a cap.
6. **No scraping behind logins.** Public pages are fine when they're the documented or de facto way to read public data.

## Errors from `ctx.fetch`

| Error | When | Typical handling |
|---|---|---|
| `HttpError` (`status`, `body`) | Any answer outside 2xx | 401/403 → `ConnectorError` about the key; 404 → about the name |
| `BlockedRequestError` | Private address, redirect, too big, too slow | Rethrow as `ConnectorError` if the URL came from the owner |

## Testing

`@flexwall/sdk/testing` gives you a fake context that answers from fixtures:

```ts
test("given a package, when weekly downloads are fetched, then the count comes back", async () => {
  // Given
  const ctx = fakeContext({ "https://api.npmjs.org/downloads/point/last-week/react": { downloads: 1000 } });

  // When
  const values = await npm.fetch({ metrics: ["weekly-downloads"], params: { package: "react" }, secret: null, public: null }, ctx);

  // Then
  expect(values["weekly-downloads"]).toEqual(number(1000, { unit: "count" }));
});
```

Routes match by longest URL prefix; an unknown URL throws, like an outage.
`ctx.calls` lists what was requested, to assert batching. Keep a real response
in `tests/fixtures/` when parsing is non-trivial (see `plugins/github`).
