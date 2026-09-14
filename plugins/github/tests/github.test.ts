import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkPlugins, ConnectorError, HttpError, type CalendarDay } from "@flexwall/sdk";
import { fakeContext } from "@flexwall/sdk/testing";
import github, { currentStreak, githubConnector, parseContributions } from "../src/index";

const html = readFileSync(new URL("./fixtures/contributions.html", import.meta.url), "utf8");
const request = (metrics: string[], params: Record<string, string>) => ({ metrics, params, secret: null, public: null });

describe("github plugin", () => {
  test("given the plugin, when checked, then it has no problems", () => {
    // Given / When
    const problems = checkPlugins([github]);

    // Then
    expect(problems).toEqual([]);
  });

  test("given the real contribution calendar page, when parsed, then a year of days comes back", () => {
    // Given
    const page = html;

    // When
    const days = parseContributions(page);

    // Then
    expect(days.length).toBeGreaterThan(360);
    expect(days.filter((d) => d.level === 0).every((d) => d.count === 0)).toBe(true);
  });

  test("given no commit yet today, when the streak is computed, then yesterday still counts; a gap yesterday breaks it", () => {
    // Given
    const days: CalendarDay[] = [
      { date: "2026-09-12", count: 1, level: 1 },
      { date: "2026-09-13", count: 4, level: 2 },
      { date: "2026-09-14", count: 0, level: 0 },
    ];

    // When
    const today = currentStreak(days, "2026-09-14");
    const tomorrow = currentStreak(days, "2026-09-15");

    // Then
    expect(today).toBe(2);
    expect(tomorrow).toBe(0);
  });

  test("given tiles for streak, contributions and graph of one user, when fetched, then one page answers all three", async () => {
    // Given
    const ctx = fakeContext({ "https://github.com/users/torvalds/contributions": html }, { today: "2026-09-12" });
    const keys = ["streak", "contributions", "activity"].map((metric) => githubConnector.cacheKey!({ metric, params: { user: "Torvalds" } }));

    // When
    const values = await githubConnector.fetch(request(["streak", "contributions", "activity"], { user: "torvalds" }), ctx);

    // Then
    expect(new Set(keys).size).toBe(1);
    expect(values.streak?.type).toBe("number");
    expect(values.activity?.type).toBe("calendar");
    expect(ctx.calls).toHaveLength(1);
  });

  test("given a host GitHub token, when stars are fetched, then the token is sent", async () => {
    // Given
    let authorization = "";
    const ctx = fakeContext(
      { "https://api.github.com/repos/vercel/next.js": (init?: { headers?: Record<string, string> }) => ((authorization = init?.headers?.Authorization ?? ""), { stargazers_count: 140000 }) },
      { env: { GITHUB_TOKEN: "ghp_x" } }
    );

    // When
    const values = await githubConnector.fetch(request(["stars"], { repo: "vercel/next.js" }), ctx);

    // Then
    expect(values.stars).toEqual({ type: "number", value: 140000, unit: "count" });
    expect(authorization).toBe("Bearer ghp_x");
  });

  test("given a repository that doesn't exist, when fetched, then the owner gets a sentence, not a stack trace", async () => {
    // Given
    const ctx = fakeContext({
      "https://api.github.com/": () => {
        throw new HttpError(404, "https://api.github.com/repos/a/b", "");
      },
    });

    // When
    const attempt = githubConnector.fetch(request(["stars"], { repo: "a/b" }), ctx);

    // Then
    await expect(attempt).rejects.toBeInstanceOf(ConnectorError);
  });
});
