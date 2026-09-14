import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import github, { currentStreak, githubConnector, parseContributions } from "../src/index";

const html = readFileSync(new URL("./fixtures/contributions.html", import.meta.url), "utf8");

describe("github plugin", () => {
  test("passes the plugin checks", () => expect(checkPlugins([github])).toEqual([]));

  test("parses a year of days from the real calendar fragment", () => {
    const days = parseContributions(html);
    expect(days.length).toBeGreaterThan(360);
    expect(days.filter((d) => d.level === 0).every((d) => d.count === 0)).toBe(true);
  });

  test("streak tolerates an empty today, not an empty yesterday", () => {
    const days = [
      { date: "2026-09-12", count: 1, level: 1 as const },
      { date: "2026-09-13", count: 4, level: 2 as const },
      { date: "2026-09-14", count: 0, level: 0 as const },
    ];
    expect(currentStreak(days, "2026-09-14")).toBe(2);
    expect(currentStreak(days, "2026-09-15")).toBe(0);
  });

  test("one calendar fetch answers streak, contributions and activity", async () => {
    const ctx = fakeContext({ "https://github.com/users/torvalds/contributions": html }, { today: "2026-09-12" });
    const keys = ["streak", "contributions", "activity"].map((metric) => githubConnector.cacheKey!({ metric, params: { user: "Torvalds" } }));
    expect(new Set(keys).size).toBe(1);
    const out = await githubConnector.fetch({ metrics: ["streak", "contributions", "activity"], params: { user: "torvalds" }, secret: null, public: null }, ctx);
    expect(out.streak?.type).toBe("number");
    expect(out.activity?.type).toBe("calendar");
    expect(ctx.calls).toHaveLength(1);
  });

  test("stars use the token when the host provides one, and name missing repos", async () => {
    let auth = "";
    const ctx = fakeContext(
      { "https://api.github.com/repos/vercel/next.js": (init?: { headers?: Record<string, string> }) => ((auth = init?.headers?.Authorization ?? ""), { stargazers_count: 140000 }) },
      { env: { GITHUB_TOKEN: "ghp_x" } }
    );
    const out = await githubConnector.fetch({ metrics: ["stars"], params: { repo: "vercel/next.js" }, secret: null, public: null }, ctx);
    expect(out.stars).toEqual({ type: "number", value: 140000, unit: "count" });
    expect(auth).toBe("Bearer ghp_x");

    const missing = fakeContext({ "https://api.github.com/": () => { throw new HttpError(404, "https://api.github.com/repos/a/b", ""); } });
    await expect(githubConnector.fetch({ metrics: ["stars"], params: { repo: "a/b" }, secret: null, public: null }, missing)).rejects.toBeInstanceOf(ConnectorError);
  });
});
