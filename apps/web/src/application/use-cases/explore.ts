import { Handle } from "@/domain/handle";
import { formatBand, formatValue, VERIFIED_LEADERBOARDS, type Leaderboard } from "@flexwall/sdk";
import type { Catalog } from "@/domain/catalog";
import { DomainError } from "@/domain/errors";
import { REPORT_REASON_MAX, REPORT_REASON_MIN, reportContact } from "@/domain/report";
import { entitlementsOf } from "@/domain/user";
import { effectiveTheme, publicTiles, type Wall } from "@/domain/wall";
import type { Clock, Mailer, UserRepository, WallRepository } from "../ports";
import { wallNumbers } from "../wall-numbers";
import type { ResolveWall } from "./resolve-wall";

export type ExploreSort = "recent" | Leaderboard;

export interface ExploreEntry {
  handle: string;
  title: string;
  bio: string;
  /** The theme the wall is drawn with, as on its page. */
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

    const numbers = wallNumbers(tiles, states, this.deps.catalog);

    const ranks: ExploreEntry["ranks"] = {};
    for (const n of numbers) {
      const board = this.deps.catalog.metric(n.binding.connector, n.binding.metric)?.leaderboard;
      // Revenue and wealth ranks only count what the owner's own account says.
      if (!board || (VERIFIED_LEADERBOARDS.includes(board) && !n.verified)) continue;
      ranks[board] = Math.max(ranks[board] ?? -Infinity, n.value.value);
    }

    return {
      handle: wall.handle,
      title: wall.title,
      bio: wall.bio,
      theme: effectiveTheme(wall, this.deps.catalog, entitlementsOf(owner, this.deps.clock.now())).id,
      // Only numbers read from the owner's own accounts earn a spot here.
      highlights: numbers
        .filter((n) => n.verified)
        .slice(0, 3)
        .map((n) => ({
          label: n.label,
          value: n.range ? formatBand(n.value) : formatValue(n.value),
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
    if (reason.length < REPORT_REASON_MIN || reason.length > REPORT_REASON_MAX) throw new DomainError("invalid_input", `Tell us what's wrong in a few words (up to ${REPORT_REASON_MAX} characters).`);
    const contact = reportContact(input.contact);
    const handle = Handle.lookup(input.handle);
    if (!handle) return;
    const wall = await this.deps.walls.byHandle(handle);
    if (!wall) return;
    await this.deps.mailer.send({
      to: this.deps.moderationInbox,
      subject: `Report: @${wall.handle}`,
      text: `Wall: @${wall.handle} (${wall.id})\nContact: ${contact || "none"}\n\n${reason}`,
      html: `<p>Wall: @${wall.handle} (${wall.id})<br>Contact: ${escapeHtml(contact || "none")}</p><pre>${escapeHtml(reason)}</pre>`,
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
