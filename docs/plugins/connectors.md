# Writing a connector

A connector declares **metrics** and knows how to **fetch** them. The host does
everything else: forms, validation, encrypting credentials, caching, grouping
requests, deadlines, stale fallbacks, plan gating, daily history.

Real examples to read, from simplest to richest: `plugins/npm` (public, one
request, a series), `plugins/bluesky` (public, one request answers three
metrics), `plugins/youtube` (a server-side key), `plugins/stripe` (credentials,
pagination, computed MRR), `plugins/plausible` (credentials plus a non-secret
setting).

```ts
import { ConnectorError, defineConnector, field, HttpError, number } from "@flexwall/sdk";

export const npm = defineConnector({
  id: "npm",
  name: "npm",
  description: "Downloads of a package on the npm registry.",
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
      params: [field.text("package", "Package", { placeholder: "react", pattern: "^(@[A-Za-z0-9-~][A-Za-z0-9-._~]*/)?[A-Za-z0-9-~][A-Za-z0-9-._~]*$", patternMessage: "isn't a valid package name" })],
      defaults: { label: "weekly downloads" },
      leaderboard: "audience",
    },
  ],

  // Keep the case: "JSONStream" and "jsonstream" are different packages.
  cacheKey: ({ params }) => `package:${params.package}`,

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

## Getting started

```bash
bun run new-plugin my-service "My Service"   # copies templates/plugin, registers it in the app
bun install                                  # links @flexwall/sdk into the new folder
bun test plugins/my-service
```

`bun install` is required: until it runs, `@flexwall/sdk` doesn't resolve from
the new folder. To add a plugin by hand instead, copy `templates/plugin`, then
add the plugin to `apps/web/src/plugins/registry.ts` and to the dependencies in
`apps/web/package.json`, then `bun install`. Your plugin's tests don't need
the app: `bun test plugins/my-service` works as soon as the SDK resolves.

A connector-only plugin deletes `src/widget.tsx`, `tests/widget.test.tsx` and
the two lines that reference the widget in `src/index.ts`.

## The definition

| Field | Meaning |
|---|---|
| `id` | Unique across all plugins: lowercase, digits, dashes. Stored in walls: never change it. |
| `name`, `description` | Shown in the editor and on the landing page. One short sentence for the description. |
| `homepage` | The service's site. |
| `icon` | Optional 24×24 SVG path (`d` attribute), for badges. Leave it out rather than guess. |
| `tier` | `"free"` or `"pro"`. Pro connectors render on public walls only for paying owners. Use Pro for anything reading someone's revenue or private analytics, and for anything costly to run. |
| `verified` | `true` only when values come from **the owner's own authenticated account**. Earns the verified badge and a place on revenue leaderboards. Requires `auth`. |
| `auth` | Credentials and account settings typed once per account. Omit for public data. |
| `metrics` | What tiles can show. |
| `ttl` | Seconds a value stays fresh. Minimum 60. |
| `cacheKey` | Groups metrics that the same requests answer. |
| `fetch` | Returns values for the requested metrics. |
| `connect` | Tests credentials and splits them into what's secret and what isn't. Required with `auth`. |
| `sample` | A plausible value for every metric, used by previews and marketing. |

### Metrics

```ts
{ id, name, description?, type: "number" | "series" | "calendar" | "text", unit?, params?, defaults?, leaderboard? }
```

- `params` are per-tile settings (a repository, a package). They're public and stored in the wall.
- `defaults.label` becomes the tile's label when someone picks the metric.
- `leaderboard` enters the metric in an Explore ranking: `"revenue"`, `"streak"`, `"audience"`, `"stars"`. Revenue rankings only count verified connectors, and compare amounts without converting currencies; say in your README if your number is defined differently from others (Polar's MRR counts past-due subscriptions, Stripe's doesn't).
- Number metrics get **history for free**: the host records one reading a day and can feed a trend widget.

### Values

```ts
number(1613, { unit: "count" })
money(4820, "usd")                                   // lowercase ISO code
series(points, { unit: "currency", currency: "usd" }) // [{ t: "YYYY-MM-DD", v }], oldest first
calendar(days)                                        // [{ date, count, level 0–4 }], oldest first
text("Shipping v2")
```

**Empty data.** Return `null` when the upstream has no answer for a metric
(hidden subscriber counts, a package with no downloads data yet). Return `0`
when zero is the true answer. A series with no days is `series([])`: trend
widgets say history is coming.

**Samples.** Every metric needs one, even metrics that can be `null`. Build
series and calendars relative to today so previews never look stale; see
`plugins/stripe` (`revenue-daily`) and `plugins/github` (`sampleDays`).

## Params

- Params reach `fetch` **already validated** against their field: required, `maxLength`, and `pattern` matched against the trimmed value.
- Values arrive exactly as typed. If the upstream is case-insensitive or normalizes names (PyPI turns `Flask_SQLAlchemy` into `flask-sqlalchemy`), normalize in `fetch` and in `cacheKey`, so equivalent spellings share a cache entry.
- **Encode what you put in a URL**: `encodeURIComponent(value)`. The exception is a value your pattern already restricts to URL-safe characters that must stay unencoded (npm scoped packages keep their `/`).
- Write patterns that accept every real name. Check against real data: npm allows capitals in old package names.
- `patternMessage` is appended to the field label, so phrase it as a predicate: `"isn't a valid package name"`, `"must start with polar_oat_"`.

## Fetching

```ts
fetch(req: { metrics, params, secret, public }, ctx: { fetch, today, env, log })
```

| | |
|---|---|
| `metrics` | Every metric of this cache group some tile needs. Return as many as your requests answer. |
| `params` | Validated params of the tile(s) in this group. |
| `secret` | The decrypted `secret` object `connect` returned, or `null` for public connectors. |
| `public` | The `public` object `connect` returned: use it for non-secret account settings (a store id, a self-hosted instance URL). `null` for public connectors. |
| `ctx.fetch.json(url, init?)`, `ctx.fetch.text(url, init?)` | The only network you get. `init`: `method` (`GET` or `POST`), `headers`, `body`, `maxBytes`, `timeoutMs`. |
| `ctx.today` | The owner's date, YYYY-MM-DD. |
| `ctx.env(name)` | Server configuration the host shares with plugins. |
| `ctx.log(message)` | A server log line. Never log secrets. |

### Limits of `ctx.fetch`

| | Default | Maximum |
|---|---|---|
| Response size (`maxBytes`) | 1 MB | 4 MB |
| Time (`timeoutMs`) | 6 s | 15 s |

HTTPS only, no redirects. A render waits at most **4 seconds** for your fetch;
past that it shows the last known value and lets your request finish in the
background to fill the cache. So a slow upstream costs freshness, not a broken
tile, but the first render of a new tile needs you under 4 seconds.

### Grouping requests with `cacheKey`

By default each metric plus its params is one group. When the same requests
answer several metrics, return the same key for them:

```ts
cacheKey: () => "account",                                   // Stripe: one pass answers everything
cacheKey: ({ params }) => `profile:${String(params.handle).toLowerCase()}`, // Bluesky: one profile call
```

A group may make **several requests** (a page walk, a total plus a daily
breakdown). Make only the ones the requested `metrics` need. The host adds the
connector and connection to the key and makes sure a group is fetched once,
even when ten tiles need it at the same moment.

### Pagination

Walk pages with a hard cap (Stripe stops at 20,000 objects) and prefer
provider totals (`meta.page.total`, `totals`) over counting pages. When you
stop at the cap, the number is a floor: `ctx.log` it, and say so in your README.

### Server configuration (`ctx.env`)

Some APIs need a key that belongs to the Flexwall server, not the owner
(YouTube's Data API). The host shares an explicit allowlist of variables with
plugins, in `apps/web/src/composition.ts` (`GuardedRuntime`): add yours there
in the same pull request and document it in `docs/self-hosting.md`. When the
variable is missing, throw `ConnectorError("This Flexwall server has no … key.")`
before any request. Send server keys in a header rather than the URL when the
API allows it.

## Credentials

```ts
auth: {
  label: "Connect Acme",
  help: "In Acme, open Settings → API → New key and give it read access to Subscriptions only.",
  fields: [
    field.secret("key", "API key", { pattern: "^acme_", patternMessage: "must start with acme_" }),
    field.url("instance", "Instance", { optional: true, default: "https://api.acme.com", help: "Only for self-hosted Acme." }),
  ],
},

async connect(input, ctx) {
  const key = String(input.key);
  const instance = String(input.instance);
  try {
    const me = await ctx.fetch.json<{ id: string; name: string }>(`${instance}/v1/me`, { headers: { Authorization: `Bearer ${key}` } });
    return {
      secret: { key },
      public: { hint: `…${key.slice(-4)}`, instance },
      label: `Acme (${me.name})`,
      accountId: me.id,
    };
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) throw new ConnectorError("Acme refused this key.");
    throw error;
  }
},
```

`plugins/plausible` shows how to test a key when the API has no "who am I"
endpoint; `plugins/lemon-squeezy` shows choosing one store among several.

- Every field reaches `connect` validated, in `input`. **Secret** fields are also encrypted automatically; put what `fetch` needs in `secret` and non-secret settings in `public`.
- `secret` is sealed with AES-256-GCM and only ever handed back to `fetch`. Never put secrets in `public`, `label`, error messages or logs. Test it.
- `public` is shown in the owner's connection list and passed to `fetch`. A key hint shows the last 4 characters at most.
- `accountId` is a stable upstream id (a store, an organization) so reconnecting the same account replaces the connection. If one key can reach several accounts, add a field to choose one and include it in `accountId`. Leave it out when the upstream has no such id.
- **Test the credentials in `connect`**, so a wrong key fails when it's typed, not at 7 in the morning on someone's lock screen. When the API has no "who am I" endpoint, make the cheapest request that tells a good key from a bad one, and write down why it works.
- **Least privilege.** Ask for read-only credentials and name the exact permissions or scopes in `help`. Refuse full-access keys when a restricted kind exists (Stripe refuses `sk_`). When the provider has no read-only keys (Lemon Squeezy), say so in `help` and recommend a dedicated key the owner can revoke.
- Secret fields accept 4,000 characters by default; set `maxLength` if keys are longer.

## Errors

| Situation | What to do |
|---|---|
| Something the owner can fix: wrong or revoked key, missing permission, unknown user, site outside their account | Throw `ConnectorError("One plain sentence.")`. The editor shows it; public pages show a neutral placeholder. |
| Anything else: outages, 5xx, 429, quota exhausted, a response you didn't expect | Let it through. |

In both cases a tile that already has a value keeps showing it, marked stale,
until a fetch succeeds again.

Status codes don't mean the same thing everywhere; map what *this* API does:

| From `ctx.fetch` | Meaning | Typical handling |
|---|---|---|
| `HttpError` with `status` 401/403 | Usually the key or its permissions | `ConnectorError` about the key, unless the body says quota or rate limit: then let it through |
| `HttpError` 404, or 400 with a "not found" error body | Unknown name | `ConnectorError` naming it. `error.body` is the raw response text: parse it yourself |
| `HttpError` 402 | Plan or billing on the provider's side | `ConnectorError` about the plan |
| `HttpError` 429 | Rate limited | Let it through, and raise your `ttl` |
| A **2xx with `null` or an empty list** | Some APIs answer "not found" this way (Hacker News) | Check it and throw `ConnectorError` |
| `BlockedRequestError` | The host refused or couldn't complete the request | See `error.reason` below |

`BlockedRequestError.reason` is one of `private-address`, `redirect`,
`too-large`, `timeout`, `invalid-url`, `network`. Its `message` is a lowercase
fragment written to follow a subject: `new ConnectorError(`The endpoint ${error.message}.`)`.
Only turn it into a `ConnectorError` when the URL came from the owner and the
reason is something they can fix (`private-address`, `redirect`, `invalid-url`).

## Rules

These are checked in review. A connector that breaks one isn't merged.

1. **All network goes through `ctx.fetch`.** Never `fetch`, `node:http(s)` or an SDK that opens its own connections. `ctx.fetch` refuses private and cloud metadata addresses at connect time; the server Flexwall runs on can mint credentials from its metadata server, and this is what keeps a URL from reaching it.
2. **Least privilege**, as described above.
3. **Secrets only through `connect()`'s `secret`.**
4. **Errors people can act on**, as described above.
5. **Be kind to upstreams.** Respect published limits. For APIs that don't publish any, stay at or above an hour of `ttl` unless the number changes faster, and never below 5 minutes for data that updates daily. Batch with `cacheKey`; cap pagination.
6. **No scraping behind logins.** Public pages are fine when they're the documented or de facto way to read public data (GitHub's contribution calendar).

## Testing

`@flexwall/sdk/testing` gives you a context that answers from fixtures:

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

- Routes match the **longest URL prefix**. An unknown URL throws, like an outage.
- A route is a body, or a function `(init, url) => body` to check headers, read a POST body or serve pages: `(init, url) => pages[new URL(url).searchParams.get("page") ?? "1"]`. Throw an `HttpError` from it to simulate failures.
- `fakeContext(routes, { today, env })` sets the owner's date and server variables.
- `ctx.calls` lists requested URLs, to assert batching and caps.
- Save a small real response in `tests/fixtures/` when parsing isn't trivial. Without real credentials, build fixtures from the provider's documented examples and list what you couldn't verify in the pull request.
- `checkPlugins([plugin])` catches malformed definitions; id clashes with other plugins are caught by the app's registry test.

Tests are Given / When / Then, in the test name and as `// Given`, `// When`,
`// Then` comments in the body.
