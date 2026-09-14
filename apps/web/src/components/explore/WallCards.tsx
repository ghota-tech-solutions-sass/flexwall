import Link from "next/link";
import type { CSSProperties } from "react";
import { SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Leaderboard, Theme } from "@flexwall/sdk";
import type { ExploreEntry } from "@/application/use-cases/explore";
import { boardValue, updatedAgo } from "@/presentation/explore/boards";

function initialOf(entry: ExploreEntry): string {
  return (entry.title.trim() || entry.handle).charAt(0).toUpperCase();
}

function themeStyle(theme: Theme): CSSProperties {
  return {
    background: theme.page,
    ...(theme.wallpaper ? { backgroundImage: theme.wallpaper } : {}),
    color: theme.ink,
    ["--card-tile" as string]: theme.tile,
    ["--card-tile-border" as string]: theme.tileBorder,
    ["--card-muted" as string]: theme.muted,
    ["--card-positive" as string]: theme.positive,
  };
}

/**
 * A listed wall as a small preview in its own theme: who it is, then its
 * verified numbers as tiles. The ranked value, when there is one, sits under.
 */
export function WallCard({ entry, theme, now, rank, board }: { entry: ExploreEntry; theme: Theme; now: number; rank?: number; board?: Leaderboard }) {
  const ranked = board && entry.ranks[board] !== undefined ? boardValue(board, entry.ranks[board]!) : null;
  return (
    <Link href={`/@${entry.handle}`} className="wall-card">
      <div className="wall-card-preview" style={themeStyle(theme)}>
        <div className="wall-card-who">
          <span className="wall-card-avatar" style={{ fontFamily: theme.display.family }}>
            {initialOf(entry)}
          </span>
          <span>
            <strong style={{ fontFamily: theme.display.family }}>{entry.title || `@${entry.handle}`}</strong>
            <span>@{entry.handle}</span>
          </span>
          {rank ? <span className="wall-card-rank">#{rank}</span> : null}
        </div>
        <div className="wall-card-tiles">
          {entry.highlights.length ? (
            entry.highlights.map((h) => (
              <span key={h.label + h.value} className="wall-card-tile">
                <span>{h.label}</span>
                <b style={{ fontFamily: theme.display.family }}>{h.value}</b>
              </span>
            ))
          ) : (
            <span className="wall-card-tile quiet">
              <span>No verified numbers yet</span>
            </span>
          )}
        </div>
      </div>
      <div className="wall-card-foot">
        {ranked ? (
          <span className="wall-card-value">
            <b>{ranked}</b>
            {board === "revenue" ? (
              <span className="seal">
                <SealCheckIcon size={14} weight="fill" />
                Verified
              </span>
            ) : null}
          </span>
        ) : (
          <p>{entry.bio || "No bio yet."}</p>
        )}
        <span className="wall-card-meta">Updated {updatedAgo(entry.updatedAt, now)}</span>
      </div>
    </Link>
  );
}

/** Rows after the podium: rank, who, the ranked value. */
export function RankTable({ entries, board, start, now }: { entries: ExploreEntry[]; board: Leaderboard; start: number; now: number }) {
  return (
    <ol className="rank-table" start={start}>
      {entries.map((e, i) => (
        <li key={e.handle}>
          <Link href={`/@${e.handle}`}>
            <span className="rank-n">{start + i}</span>
            <span className="rank-avatar">{initialOf(e)}</span>
            <span className="rank-who">
              <strong>{e.title || `@${e.handle}`}</strong>
              <span>
                @{e.handle}
                {e.bio ? <em>{e.bio.slice(0, 70)}</em> : null}
              </span>
            </span>
            <span className="rank-updated">{updatedAgo(e.updatedAt, now)}</span>
            <b className="rank-value">{boardValue(board, e.ranks[board]!)}</b>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** The Wall before anyone is listed: the shape of what's coming, and how to be first. */
export function EmptyWall({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="wall-empty">
      <div className="wall-empty-ghosts" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="ghost">
            <span className="ghost-who" />
            <span className="ghost-tiles">
              <span />
              <span />
            </span>
          </span>
        ))}
      </div>
      <div className="wall-empty-copy">
        <h2>Nobody is listed yet. Be the first.</h2>
        <ol>
          <li>Publish your wall.</li>
          <li>Tick &ldquo;List me on The Wall&rdquo; in the editor.</li>
          <li>Connect Stripe, Lemon Squeezy or Polar to rank on verified revenue.</li>
        </ol>
        <Link href={signedIn ? "/edit" : "/login"} className="btn btn-signal">
          {signedIn ? "Open the editor" : "Claim your wall"}
        </Link>
      </div>
    </div>
  );
}
