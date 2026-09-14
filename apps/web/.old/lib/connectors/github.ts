import { CATALOG } from "@/lib/connectors/catalog";
import type { Connector, Values } from "@/lib/connectors/types";
import { getGithubStats } from "@/lib/sources/github";

/**
 * Public GitHub numbers. Streak and contributions come from the contribution
 * calendar page (no API quota); followers and stars from the REST API, which
 * allows 60 requests an hour per IP without a token, 5000 with GITHUB_TOKEN
 * (a no-scope token is enough).
 */

async function api(path: string): Promise<Record<string, unknown> | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "flexwall.lol wallpaper renderer",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(6000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github api ${path}: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export const github: Connector = {
  spec: CATALOG.github,
  ttlMs: 60 * 60 * 1000,

  cacheKey({ field, params }) {
    if (field === "stars") return `repo:${params.repo?.toLowerCase()}`;
    if (field === "followers") return `user-api:${params.user?.toLowerCase()}`;
    return `calendar:${params.user?.toLowerCase()}`;
  },

  async fetch({ field, params, today }): Promise<Values> {
    if (field === "stars") {
      const repo = await api(`/repos/${params.repo}`);
      return { stars: typeof repo?.stargazers_count === "number" ? repo.stargazers_count : null };
    }
    if (field === "followers") {
      const user = await api(`/users/${encodeURIComponent(params.user)}`);
      return { followers: typeof user?.followers === "number" ? user.followers : null };
    }
    const stats = await getGithubStats(params.user, today);
    return { streak: stats?.streak ?? null, contributions: stats?.lastYear ?? null };
  },

  sample: (field) => ({ streak: 47, contributions: 1834, followers: 1613, stars: 2410 })[field] ?? 0,
};
