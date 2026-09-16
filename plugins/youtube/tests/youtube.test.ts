import { describe, expect, test } from "bun:test";
import { checkPlugins, ConnectorError, HttpError, number, validateFields } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import youtube, { API, channelUrl, youtubeConnector } from "../src/index";

const KEY = "AIzaSyTESTKEY0123456789abcdefghijklmn";
const CHANNEL_ID = "UCHnyfMqiRRG1u-2MsSQLbXA";
const request = (channel: string) => ({ metrics: ["subscribers", "views", "videos"], params: { channel }, secret: null, public: null });

/** A channels.list answer in the documented shape; counts are strings, as Google sends unsigned longs. */
const aChannel = (statistics: object) => ({
  kind: "youtube#channelListResponse",
  etag: "etag",
  pageInfo: { totalResults: 1, resultsPerPage: 5 },
  items: [{ kind: "youtube#channel", etag: "etag", id: CHANNEL_ID, statistics }],
});

/** A Google API error body with its reasons. */
const aGoogleError = (status: number, reason: string, detail?: string) =>
  new HttpError(
    status,
    `${API}?part=statistics&forHandle=%40someone`,
    JSON.stringify({ error: { code: status, message: "…", errors: [{ message: "…", domain: "global", reason }], ...(detail ? { details: [{ reason: detail }] } : {}) } })
  );

describe("youtube plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([youtube]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given a handle, when every metric is fetched, then one request answers all three with the key in a header", async () => {
    // Given
    let apiKeyHeader = "";
    const ctx = fakeContext(
      {
        [channelUrl("@veritasium")]: (init?: { headers?: Record<string, string> }) => (
          (apiKeyHeader = init?.headers?.["x-goog-api-key"] ?? ""), aChannel({ viewCount: "1836512", subscriberCount: "12400", hiddenSubscriberCount: false, videoCount: "214" })
        ),
      },
      { env: { YOUTUBE_API_KEY: KEY } }
    );
    const keys = ["subscribers", "views", "videos"].map((metric) => youtubeConnector.cacheKey!({ metric, params: { channel: "@Veritasium" } }));

    // When
    const values = await youtubeConnector.fetch(request("@veritasium"), ctx);

    // Then
    expect(values).toEqual({ subscribers: number(12400, { unit: "count" }), views: number(1836512, { unit: "count" }), videos: number(214, { unit: "count" }) });
    expect(new Set(keys).size).toBe(1);
    expect(ctx.calls).toEqual([`${API}?part=statistics&forHandle=%40veritasium`]);
    expect(ctx.calls[0]).not.toContain(KEY);
    expect(apiKeyHeader).toBe(KEY);
  });

  test("given a channel id, when fetched, then it's looked up by id", async () => {
    // Given
    const ctx = fakeContext({ [`${API}?part=statistics&id=${CHANNEL_ID}`]: aChannel({ viewCount: "10", subscriberCount: "2", hiddenSubscriberCount: false, videoCount: "1" }) }, { env: { YOUTUBE_API_KEY: KEY } });

    // When
    const values = await youtubeConnector.fetch(request(CHANNEL_ID), ctx);

    // Then
    expect(values.subscribers).toEqual(number(2, { unit: "count" }));
    expect(ctx.calls).toHaveLength(1);
  });

  test("given a channel that hides its subscriber count, when fetched, then subscribers is null and the rest comes back", async () => {
    // Given
    const ctx = fakeContext({ [API]: aChannel({ viewCount: "5000", subscriberCount: "0", hiddenSubscriberCount: true, videoCount: "12" }) }, { env: { YOUTUBE_API_KEY: KEY } });

    // When
    const values = await youtubeConnector.fetch(request("@quiet"), ctx);

    // Then
    expect(values.subscribers).toBeNull();
    expect(values.views).toEqual(number(5000, { unit: "count" }));
    expect(values.videos).toEqual(number(12, { unit: "count" }));
  });

  test("given a server without a YouTube key, when fetched, then the owner is told and nothing is requested", async () => {
    // Given
    const ctx = fakeContext({ [API]: aChannel({}) });

    // When
    const attempt = youtubeConnector.fetch(request("@veritasium"), ctx);

    // Then
    await expect(attempt).rejects.toThrow("This Flexwall server has no YouTube API key.");
    expect(ctx.calls).toEqual([]);
  });

  test("given a handle nobody has, when fetched, then the owner gets a sentence whether YouTube answers empty or 404", async () => {
    // Given
    const empty = fakeContext({ [API]: { kind: "youtube#channelListResponse", pageInfo: { totalResults: 0, resultsPerPage: 5 } } }, { env: { YOUTUBE_API_KEY: KEY } });
    const missing = fakeContext(
      {
        [API]: () => {
          throw aGoogleError(404, "channelNotFound");
        },
      },
      { env: { YOUTUBE_API_KEY: KEY } }
    );

    // When
    const errors = await Promise.all([empty, missing].map((ctx) => youtubeConnector.fetch(request("@nobody"), ctx).catch((e: unknown) => e)));

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("YouTube has no channel called @nobody.");
    }
  });

  test("given a key YouTube rejects, when fetched, then the owner gets a sentence that never contains the key", async () => {
    // Given
    const failures = [aGoogleError(400, "badRequest", "API_KEY_INVALID"), aGoogleError(403, "forbidden")];

    // When
    const errors = await Promise.all(
      failures.map((failure) =>
        youtubeConnector
          .fetch(
            request("@someone"),
            fakeContext(
              {
                [API]: () => {
                  throw failure;
                },
              },
              { env: { YOUTUBE_API_KEY: KEY } }
            )
          )
          .catch((error: unknown) => error)
      )
    );

    // Then
    for (const error of errors) {
      expect(error).toBeInstanceOf(ConnectorError);
      expect((error as Error).message).toBe("YouTube refused this Flexwall server's API key.");
      expect((error as Error).message).not.toContain(KEY);
    }
  });

  test("given the server's daily quota is used up, when fetched, then the error passes through so the last good value stays", async () => {
    // Given
    const ctx = fakeContext(
      {
        [API]: () => {
          throw aGoogleError(403, "quotaExceeded");
        },
      },
      { env: { YOUTUBE_API_KEY: KEY } }
    );

    // When
    const error = await youtubeConnector.fetch(request("@someone"), ctx).catch((e: unknown) => e);

    // Then
    expect(error).toBeInstanceOf(HttpError);
    expect(error).not.toBeInstanceOf(ConnectorError);
  });

  test("given what owners type, when the channel field is validated, then handles and ids pass and URLs don't", () => {
    // Given
    const fields = youtubeConnector.metrics[0].params!;

    // When
    const results = ["@veritasium", CHANNEL_ID, "https://youtube.com/@veritasium", "veritasium"].map((channel) => validateFields(fields, { channel }).error);

    // Then
    expect(results[0]).toBeNull();
    expect(results[1]).toBeNull();
    expect(results[2]).toContain("handle starting with @");
    expect(results[3]).toContain("handle starting with @");
  });

  test("given the server's API key, when the back office asks what it points at, then it is production and configured only with a key", () => {
    // Given
    const missing = fakeContext({}, { env: {} });
    const set = fakeContext({}, { env: { YOUTUBE_API_KEY: KEY } });

    // When
    const [a, b] = [missing, set].map((ctx) => youtubeConnector.server!(ctx));

    // Then
    expect(a).toEqual({ configured: false, environment: "production", detail: "YOUTUBE_API_KEY unset" });
    expect(b).toEqual({ configured: true, environment: "production", detail: "API key set" });
  });
});
