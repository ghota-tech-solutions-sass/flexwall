import { ConnectorError, defineConnector, definePlugin, field, HttpError, number, type ConnectorContext, type FetchResult, type NumberValue } from "@flexwall/sdk";

/**
 * Personal bests and typing stats from the owner's Monkeytype account, read
 * with an ApeKey. A refresh makes at most two requests: one for every time-mode
 * personal best, one for the typing stats.
 */

const API = "https://api.monkeytype.com";

/** One personal best. Monkeytype keeps one per language, difficulty, punctuation and numbers combination. */
export interface PersonalBest {
  wpm: number;
  acc?: number;
  raw?: number;
  language?: string;
  difficulty?: string;
  punctuation?: boolean;
  numbers?: boolean;
  lazyMode?: boolean;
  timestamp?: number;
}

/** `GET /users/personalBests?mode=time`: bests keyed by test length in seconds ("15", "60"), or null. */
export interface PersonalBestsResponse {
  message: string;
  data: Record<string, PersonalBest[] | PersonalBest | null | undefined> | null;
}

/** `GET /users/stats`. Every field is missing on an account that never took a test. */
export interface StatsResponse {
  message: string;
  data: { completedTests?: number; startedTests?: number; timeTyping?: number } | null;
}

/**
 * The best WPM for a time test of `seconds`, across every language and
 * setting. The OpenAPI document calls a best a single object, but the server
 * stores an array per test length, so both are accepted.
 */
export function bestWpm(data: PersonalBestsResponse["data"], seconds: "15" | "60"): NumberValue | null {
  const entry = data?.[seconds];
  const bests = (Array.isArray(entry) ? entry : entry ? [entry] : []).map((b) => b?.wpm).filter((w): w is number => typeof w === "number" && Number.isFinite(w));
  return bests.length ? number(Math.max(...bests), { unit: "count" }) : null;
}

/**
 * Seconds as hours, one decimal. The SDK declares a "duration" unit but no
 * widget formats it yet, so typing time is shown as a count of hours.
 */
export function hours(seconds: number): NumberValue {
  return number(Math.round(seconds / 360) / 10, { unit: "count" });
}

function messageOf(body: string): string {
  try {
    return String((JSON.parse(body) as { message?: unknown }).message ?? "");
  } catch {
    return "";
  }
}

/**
 * Monkeytype's ApeKey answers: 471 inactive; 470 invalid; 472 or 400 malformed;
 * 404 "ApeKey not found" (deleted); 401 no usable key. 479 (the ApeKey rate
 * limit), 429 and 503 ("ApeKeys are not being accepted") go through.
 */
function explain(error: unknown): never {
  if (error instanceof HttpError) {
    if (error.status === 471) throw new ConnectorError("This ApeKey isn't active yet: turn it on in Monkeytype under Account settings → Ape keys.");
    const refused = [401, 470, 472].includes(error.status) || ((error.status === 400 || error.status === 404) && /ape ?key/i.test(messageOf(error.body)));
    if (refused) throw new ConnectorError("Monkeytype refused this ApeKey, so check that it's copied whole and hasn't been deleted.");
  }
  throw error;
}

function get<T>(ctx: ConnectorContext, key: string, path: string): Promise<T> {
  return ctx.fetch.json<T>(`${API}${path}`, { headers: { Authorization: `ApeKey ${key}` } });
}

const monkeytypeConnector = defineConnector({
  id: "monkeytype",
  name: "Monkeytype",
  description: "Personal bests, tests and typing time from your Monkeytype account.",
  homepage: "https://monkeytype.com",
  tier: "free",
  verified: true,
  // ApeKeys share 30 requests a minute; bests and stats move only when the owner types.
  ttl: 3600,
  auth: {
    label: "Connect Monkeytype",
    help: "In Monkeytype, open Account settings → Ape keys → Generate new key, copy the key (it's shown only once), then switch it on in the \"active\" column: new ApeKeys are disabled until you do. ApeKeys can only read your results, personal bests and stats; they can't change your account. Delete the key in Monkeytype to cut Flexwall off.",
    fields: [field.secret("key", "ApeKey", { maxLength: 500, pattern: "^\\S+$", patternMessage: "can't contain spaces" })],
  },
  metrics: [
    { id: "wpm-60s", name: "Best WPM, 60 seconds", description: "Personal best on 60-second time tests, any language or setting.", type: "number", unit: "count", defaults: { label: "WPM, 60s" } },
    { id: "wpm-15s", name: "Best WPM, 15 seconds", description: "Personal best on 15-second time tests, any language or setting.", type: "number", unit: "count", defaults: { label: "WPM, 15s" } },
    { id: "tests-completed", name: "Tests completed", type: "number", unit: "count", defaults: { label: "typing tests" } },
    { id: "time-typing", name: "Time typing", description: "Total time spent in tests, in hours.", type: "number", unit: "count", defaults: { label: "hours typing" } },
  ],

  // One account: the two requests are made together, and only the ones some tile needs.
  cacheKey: () => "account",

  async fetch({ metrics, secret }, ctx) {
    if (!secret?.key) return {};
    const wanted = new Set(metrics);
    const out: FetchResult = {};
    try {
      if (wanted.has("wpm-60s") || wanted.has("wpm-15s")) {
        // Without mode2, Monkeytype returns every time-mode best at once.
        const bests = await get<PersonalBestsResponse>(ctx, secret.key, "/users/personalBests?mode=time");
        out["wpm-60s"] = bestWpm(bests.data, "60");
        out["wpm-15s"] = bestWpm(bests.data, "15");
      }
      if (wanted.has("tests-completed") || wanted.has("time-typing")) {
        const stats = await get<StatsResponse>(ctx, secret.key, "/users/stats");
        const data = stats.data;
        out["tests-completed"] = data ? number(data.completedTests ?? 0, { unit: "count" }) : null;
        out["time-typing"] = data ? hours(data.timeTyping ?? 0) : null;
      }
    } catch (error) {
      explain(error);
    }
    return out;
  },

  async connect(input, ctx) {
    const key = String(input.key ?? "").trim();
    // No ApeKey endpoint names the account; /users/stats is the cheapest call that tells a working key from a refused one.
    try {
      await get<StatsResponse>(ctx, key, "/users/stats");
    } catch (error) {
      explain(error);
    }
    const hint = `…${key.slice(-4)}`;
    return { secret: { key }, public: { hint }, label: `Monkeytype (key ${hint})` };
  },

  sample: {
    "wpm-60s": number(112.4, { unit: "count" }),
    "wpm-15s": number(131.2, { unit: "count" }),
    "tests-completed": number(2318, { unit: "count" }),
    "time-typing": number(96.5, { unit: "count" }),
  },
});

export default definePlugin({
  id: "monkeytype",
  name: "Monkeytype",
  description: "Personal bests and typing stats from Monkeytype.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  connectors: [monkeytypeConnector],
});

export { monkeytypeConnector };
