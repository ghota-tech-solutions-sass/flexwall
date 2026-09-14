import { Handle } from "@/domain/handle";
import { formatValue, type Leaderboard } from "@flexwall/sdk";
import type { Catalog } from "@/domain/catalog";
import { DomainError } from "@/domain/errors";
import { publicTiles, type Wall } from "@/domain/wall";
import type { Clock, Mailer, UserRepository, WallRepository } from "../ports";
import type { ResolveWall } from "./resolve-wall";

export type ExploreSort = "recent" | Leaderboard;

export interface ExploreEntry {
  handle: string;
  title: string;
  bio: string;
  theme: string;
  /** Up to three verified numbers, formatted, from cached values only. */
  highlights: { label: string; value: string; connector: string }[];
  /** Best value per leaderboard this wall competes on. */
  ranks: Partial<Record<Leaderboard, number>>;
  updatedAt: number;
}

/**
 * The Wall: published walls whose owners chose to be listed, with their
 * verified numbers. Reads cached values only; a listing never triggers a
 * fetch against anyone's Stripe account.
 */
export class ListExplore {
  constructor(private readonly deps: { walls: WallRepository; users: UserRepository; resolve: ResolveWall; catalog: Catalog; clock: Clock }) {}

  async execute(input: { sort: ExploreSort; limit?: number }): Promise<ExploreEntry[]> {
    const walls = (await this.deps.walls.listed(500)).filter((w) => w.published && w.listed);
    const entries = await Promise.all(walls.map((w) => this.entry(w)));
    const found = entries.filter((e): e is ExploreEntry => e !== null);
    const recent = (a: ExploreEntry, b: ExploreEntry) => b.updatedAt - a.updatedAt;
    if (input.sort === "recent") return found.sort(recent).slice(0, input.limit ?? 60);
    const board = input.sort;
    return found
      .filter((e) => e.ranks[board] !== undefined)
      .sort((a, b) => b.ranks[board]! - a.ranks[board]! || recent(a, b))
      .slice(0, input.limit ?? 60);
  }

  private async entry(wall: Wall): Promise<ExploreEntry | null> {
    const owner = await this.deps.users.byId(wall.ownerId);
    if (!owner) return null;
    const tiles = publicTiles(wall);
    const { states } = await this.deps.resolve.execute({ tiles, owner, surface: "page", cacheOnly: true });

    const numbers = tiles.flatMap((tile) => {
      const state = states[tile.id];
      if (state?.status !== "ready") return [];
      return Object.entries(tile.inputs).flatMap(([key, binding]) => {
        const input = state.inputs[key];
        if (binding.kind !== "metric" || !input || input.value.type !== "number") return [];
        return [{ tile, binding, value: input.value, verified: Boolean(input.source?.verified) }];
      });
    });

    const ranks: ExploreEntry["ranks"] = {};
    for (const n of numbers) {
      const board = this.deps.catalog.metric(n.binding.connector, n.binding.metric)?.leaderboard;
      // Revenue ranks only count what the owner's own account says.
      if (!board || (board === "revenue" && !n.verified)) continue;
      ranks[board] = Math.max(ranks[board] ?? -Infinity, n.value.value);
    }

    return {
      handle: wall.handle,
      title: wall.title,
      bio: wall.bio,
      theme: wall.theme,
      // Only numbers read from the owner's own accounts earn a spot here.
      highlights: numbers
        .filter((n) => n.verified)
        .slice(0, 3)
        .map((n) => ({
          label: String(n.tile.options.label || this.deps.catalog.metric(n.binding.connector, n.binding.metric)?.name || ""),
          value: formatValue(n.value),
          connector: this.deps.catalog.connector(n.binding.connector)?.name ?? n.binding.connector,
        })),
      ranks,
      updatedAt: wall.updatedAt,
    };
  }
}

/** Sends a report about a wall to the moderation inbox. */
export class ReportWall {
  constructor(private readonly deps: { walls: WallRepository; mailer: Mailer; moderationInbox: string }) {}

  async execute(input: { handle: string; reason: string; contact?: string }): Promise<void> {
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 1000) throw new DomainError("invalid_input", "Tell us what's wrong in a few words (up to 1000 characters).");
    if (!Handle.isValid(input.handle)) return;
    const wall = await this.deps.walls.byHandle(Handle.parse(input.handle));
    if (!wall) return;
    await this.deps.mailer.send({
      to: this.deps.moderationInbox,
      subject: `Report: @${wall.handle}`,
      text: `Wall: @${wall.handle} (${wall.id})\nContact: ${input.contact || "none"}\n\n${reason}`,
      html: `<p>Wall: @${wall.handle} (${wall.id})<br>Contact: ${escapeHtml(input.contact || "none")}</p><pre>${escapeHtml(reason)}</pre>`,
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
