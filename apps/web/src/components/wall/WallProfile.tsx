import type { ReactNode } from "react";
import { CalendarBlankIcon, ClockIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Theme } from "@flexwall/sdk";
import { formatHandle } from "@/domain/handle";
import { monogram, wallIdentity } from "@/presentation/wall/profile";

/**
 * The head of a public wall, read like a profile: monogram, name, handle and
 * facts on one line, the bio, and the page's actions on the right. Colors come
 * from the wall's theme through the `--wall-*` variables set on the page.
 */
export function WallProfile({
  title,
  handle,
  bio,
  theme,
  verified,
  updated,
  joined,
  actions,
}: {
  title: string;
  handle: string;
  bio: string;
  theme: Theme;
  verified: number;
  updated: string;
  joined: string;
  actions?: ReactNode;
}) {
  const { name, showHandle } = wallIdentity(title, handle);
  return (
    <header className="wp-profile">
      <div className="wp-avatar" aria-hidden="true" style={{ fontFamily: theme.display.family }}>
        {monogram(title, handle)}
      </div>
      <div className="wp-id">
        <span className="wp-eyebrow">The wall of {formatHandle(handle)}</span>
        <h1 style={{ fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{name}</h1>
        <ul className="wp-facts">
          {showHandle ? <li className="wp-handle">{formatHandle(handle)}</li> : null}
          {verified ? (
            <li className="wp-verified">
              <SealCheckIcon size={16} weight="fill" aria-hidden="true" />
              {verified} {verified === 1 ? "tile" : "tiles"} with verified sources
            </li>
          ) : null}
          <li>
            <ClockIcon size={16} aria-hidden="true" />
            Updated {updated}
          </li>
          <li>
            <CalendarBlankIcon size={16} aria-hidden="true" />
            {joined}
          </li>
        </ul>
      </div>
      {bio ? <p className="wp-bio">{bio}</p> : null}
      {actions ? <div className="wp-actions">{actions}</div> : null}
    </header>
  );
}
