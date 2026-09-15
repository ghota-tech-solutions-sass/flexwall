import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BlockedRequestError, checkPlugins, ConnectorError, HttpError, number, validateFields, type GuardedFetchInit } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import plugin, { API, hours, parseProfile, redact, steamConnector } from "../src/index";

/**
 * Steam publishes parameters but no example responses. `owned-games.json`
 * follows the shape community answers and the TF2 wiki document; the small
 * bodies (`{"response":{}}`, `success: 42`) are written inline.
 */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const KEY = "ABCDEF0123456789ABCDEF0123456789";
const ENV = { STEAM_API_KEY: KEY };
const GABE = "76561197960287930";
const OWNED = `${API}/IPlayerService/GetOwnedGames/v1/`;
const LEVEL = `${API}/IPlayerService/GetSteamLevel/v1/`;
const VANITY = `${API}/ISteamUser/ResolveVanityURL/v1/`;

const request = (metrics: string[], profile: string) => ({ metrics, params: { profile }, secret: null, public: null });
const ALL = ["games", "hours-played", "hours-2weeks", "level"];

describe("steam connector", () => {
  test("given the plugin, when checked, then it has no problems and every profile form passes the field", () => {
    // Given
    const field = steamConnector.metrics[0].params!;
    const forms = [GABE, "gabelogannewell", "Some_Name-1", "https://steamcommunity.com/id/GabeLoganNewell/", "steamcommunity.com/profiles/76561197960287930", "http://www.steamcommunity.com/id/gabe"];

    // When
    const problems = checkPlugins([plugin]);

    // Then
    expect(problems).toEqual([]);
    for (const profile of forms) expect(validateFields(field, { profile }).error).toBeNull();
    expect(validateFields(field, { profile: "https://example.com/id/gabe" }).error).not.toBeNull();
    expect(steamConnector.ttl).toBeGreaterThanOrEqual(3600);
  });

  test("given ids, names and profile addresses, when parsed, then ids stay and names are lowercased so spellings share a cache entry", () => {
    // Given
    const forms = [GABE, "GabeLoganNewell", "https://steamcommunity.com/id/GabeLoganNewell/", "steamcommunity.com/profiles/76561197960287930/"];

    // When
    const refs = forms.map(parseProfile);
    const keys = ["https://steamcommunity.com/id/GABELOGANNEWELL", "gabelogannewell"].map((profile) => steamConnector.cacheKey!({ metric: "games", params: { profile } }));

    // Then
    expect(refs).toEqual([
      { kind: "id", id: GABE },
      { kind: "vanity", name: "gabelogannewell" },
      { kind: "vanity", name: "gabelogannewell" },
      { kind: "id", id: GABE },
    ]);
    expect(keys[0]).toBe(keys[1]);
    expect(steamConnector.cacheKey!({ metric: "level", params: { profile: GABE } })).toBe(steamConnector.cacheKey!({ metric: "games", params: { profile: `https://steamcommunity.com/profiles/${GABE}` } }));
  });

  test("given a SteamID64, when every metric is fetched, then one owned-games call and one level call answer them all", async () => {
    // Given
    const ctx = fakeContext({ [OWNED]: fixture("owned-games"), [LEVEL]: { response: { player_level: 12 } } }, { env: ENV });

    // When
    const values = await steamConnector.fetch(request(ALL, GABE), ctx);

    // Then
    expect(values).toEqual({
      games: number(3, { unit: "count" }),
      // 243 + 12034 + 4203 minutes
      "hours-played": number(274.7, { unit: "count" }),
      // 95 + 30 minutes
      "hours-2weeks": number(2.1, { unit: "count" }),
      level: number(12, { unit: "count" }),
    });
    expect(ctx.calls).toHaveLength(2);
    const owned = new URL(ctx.calls.find((c) => c.startsWith(OWNED))!);
    expect(owned.searchParams.get("steamid")).toBe(GABE);
    expect(owned.searchParams.get("include_played_free_games")).toBe("1");
    expect(owned.searchParams.get("key")).toBe(KEY);
  });

  test("given a custom URL name, when only the level is asked, then the name is resolved and games aren't requested", async () => {
    // Given
    const ctx = fakeContext({ [VANITY]: { response: { steamid: GABE, success: 1 } }, [LEVEL]: { response: { player_level: 12 } } }, { env: ENV });

    // When
    const values = await steamConnector.fetch(request(["level"], "https://steamcommunity.com/id/GabeLoganNewell"), ctx);

    // Then
    expect(values).toEqual({ level: number(12, { unit: "count" }) });
    expect(ctx.calls).toHaveLength(2);
    expect(new URL(ctx.calls[0]).searchParams.get("vanityurl")).toBe("gabelogannewell");
    expect(new URL(ctx.calls[1]).searchParams.get("steamid")).toBe(GABE);
  });

  test("given a custom URL name nobody uses, when fetched, then the owner is told and nothing else is requested", async () => {
    // Given
    const ctx = fakeContext({ [VANITY]: { response: { success: 42, message: "No match" } } }, { env: ENV });

    // When
    const attempt = steamConnector.fetch(request(ALL, "nobody-here"), ctx);

    // Then
    await expect(attempt).rejects.toThrow(new ConnectorError("Steam has no profile at steamcommunity.com/id/nobody-here."));
    expect(ctx.calls).toHaveLength(1);
  });

  test("given a private profile, when games or level are fetched, then the owner learns which privacy setting to open", async () => {
    // Given
    const ctx = fakeContext({ [OWNED]: { response: {} }, [LEVEL]: { response: {} } }, { env: ENV });

    // When
    const errors = await Promise.all([steamConnector.fetch(request(["hours-played"], GABE), ctx).catch((e: unknown) => e), steamConnector.fetch(request(["level"], GABE), ctx).catch((e: unknown) => e)]);

    // Then
    expect(errors[0]).toBeInstanceOf(ConnectorError);
    expect((errors[0] as Error).message).toContain("Game details to Public");
    expect(errors[1]).toBeInstanceOf(ConnectorError);
    expect((errors[1] as Error).message).toContain("My profile to Public");
  });

  test("given a public profile with no games, when fetched, then zero is the answer, not an error", async () => {
    // Given
    const ctx = fakeContext({ [OWNED]: { response: { game_count: 0 } } }, { env: ENV });

    // When
    const values = await steamConnector.fetch(request(["games", "hours-played"], GABE), ctx);

    // Then
    expect(values.games).toEqual(number(0, { unit: "count" }));
    expect(values["hours-played"]).toEqual(number(0, { unit: "count" }));
  });

  test("given no Steam key on the server, when fetched, then the owner is told before any request", async () => {
    // Given
    const ctx = fakeContext({});

    // When
    const attempt = steamConnector.fetch(request(ALL, "gabelogannewell"), ctx);

    // Then
    await expect(attempt).rejects.toThrow(new ConnectorError("This Flexwall server has no Steam API key."));
    expect(ctx.calls).toEqual([]);
  });

  test("given a refused key, a rate limit or an outage, when fetched, then no thrown error carries the key", async () => {
    // Given
    const fail = (status: number, body: string) => (_init: GuardedFetchInit | undefined, url: string) => {
      throw new HttpError(status, url, body);
    };
    const cases = [
      fakeContext({ [OWNED]: fail(401, "<html>Please verify your <pre>key=</pre> parameter.</html>") }, { env: ENV }),
      fakeContext({ [OWNED]: fail(403, "<html>Access is denied.</html>") }, { env: ENV }),
      fakeContext({ [OWNED]: fail(429, "Too Many Requests") }, { env: ENV }),
      fakeContext({ [OWNED]: fail(503, "") }, { env: ENV }),
      fakeContext({ [OWNED]: () => { throw new BlockedRequestError("took longer than 6s", "timeout"); } }, { env: ENV }),
    ];

    // When
    const errors = await Promise.all(cases.map((ctx) => steamConnector.fetch(request(["games"], GABE), ctx).catch((e: unknown) => e)));

    // Then
    expect((errors[0] as Error).message).toBe("Steam refused this Flexwall server's API key.");
    expect(errors[1]).toBeInstanceOf(ConnectorError);
    expect(errors.slice(2).map((e) => (e as { status?: number }).status)).toEqual([429, 503, undefined]);
    for (const error of errors) {
      expect(JSON.stringify({ ...(error as object), message: (error as Error).message, stack: (error as Error).stack })).not.toContain(KEY);
    }
    expect((errors[2] as HttpError).url).toContain("key=redacted");
    expect(errors[2]).not.toBeInstanceOf(ConnectorError);
  });

  test("given minutes, when shown as hours, then one decimal is kept", () => {
    // Given
    const minutes = [0, 59, 90, 16480];

    // When
    const values = minutes.map((m) => hours(m).value);

    // Then
    expect(values).toEqual([0, 1, 1.5, 274.7]);
    expect(redact(`${OWNED}?key=${KEY}&steamid=${GABE}`)).toBe(`${OWNED}?key=redacted&steamid=${GABE}`);
  });
});
