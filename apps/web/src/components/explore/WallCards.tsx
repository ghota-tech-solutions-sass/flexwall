import Link from "next/link";
import type { CSSProperties } from "react";
import { SealCheckIcon } from "@phosphor-icons/react/ssr";
import { themeBackground, type Leaderboard, type Theme } from "@flexwall/sdk";
import type { ExploreEntry } from "@/application/use-cases/explore";
import { formatHandle } from "@/domain/handle";
import { boardValue, updatedAgo, VERIFIED_BOARDS } from "@/presentation/explore/boards";
import { ROUTES } from "@/presentation/routes";
import { CARD_VARIABLES, themeVariables } from "@/presentation/theme-vars";
import { monogram } from "@/presentation/wall/profile";

/** How much of a bio fits beside a name in the rank table. */
const RANK_BIO_MAX_CHARS = 70;

/** Placeholder cards drawn while nobody is listed. */
const GHOST_COUNT = 3;

function themeStyle(theme: Theme): CSSProperties {
  return { ...themeBackground(theme), color: theme.ink, ...themeVariables(theme, CARD_VARIABLES) };
}

/** The name a listed wall goes by: its title, or its handle. */
function nameOf(entry: ExploreEntry): string {
  return entry.title || formatHandle(entry.handle);
}

/**
 * A listed wall as a small preview in its own theme: who it is, then its
 * verified numbers as tiles. The ranked value, when there is one, sits under.
 */
export function WallCard({ entry, theme, now, rank, board }: { entry: ExploreEntry; theme: Theme; now: number; rank?: number; board?: Leaderboard }) {
  const ranked = board && entry.ranks[board] !== undefined ? boardValue(board, entry.ranks[board]!) : null;
  return (
    <Link href={ROUTES.wall(entry.handle)} className="wall-card">
      <div className="wall-card-preview" style={themeStyle(theme)}>
        <div className="wall-card-who">
          <span className="wall-card-avatar" style={{ fontFamily: theme.display.family }}>
            {monogram(entry.title, entry.handle)}
          </span>
          <span>
            <strong style={{ fontFamily: theme.display.family }}>{nameOf(entry)}</strong>
            <span>{formatHandle(entry.handle)}</span>
          </span>
          {rank ? <span className="wall-card-rank">#{rank}</span> : null}
        </div>
        <div className="wall-card-tiles">
          {entry.highlights.length ? (
            entry.highlights.map((h) => (
              <span key={h.label + h.value} className="wall-card-tile">
                <span>{h.label}</span>
                <b style={{ fontFamily: theme.display.family }}>{h.value}</b>
                <span className="wall-card-source" title={h.verified ? `Retrieved directly from ${h.connector} through a connected account.` : `API response verified from ${h.connector}. Confirms the data received, not account ownership or independent accuracy.`}>
                  <SealCheckIcon size={12} weight="fill" aria-hidden="true" />
                  {h.verified ? "Verified" : "API verified"} · {h.connector}
                </span>
              </span>
            ))
          ) : (
            <span className="wall-card-tile quiet">
              <span>No synced numbers available yet</span>
            </span>
          )}
        </div>
      </div>
      <div className="wall-card-foot">
        {ranked ? (
          <span className="wall-card-value">
            <b>{ranked}</b>
            {board && VERIFIED_BOARDS.includes(board) ? (
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
          <Link href={ROUTES.wall(e.handle)}>
            <span className="rank-n">{start + i}</span>
            <span className="rank-avatar">{monogram(e.title, e.handle)}</span>
            <span className="rank-who">
              <strong>{nameOf(e)}</strong>
              <span>
                {formatHandle(e.handle)}
                {e.bio ? <em>{e.bio.slice(0, RANK_BIO_MAX_CHARS)}</em> : null}
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
        {Array.from({ length: GHOST_COUNT }, (_, i) => (
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
        <Link href={signedIn ? ROUTES.edit : ROUTES.login} className="btn btn-signal">
          {signedIn ? "Open the editor" : "Claim your wall"}
        </Link>
      </div>
    </div>
  );
}
