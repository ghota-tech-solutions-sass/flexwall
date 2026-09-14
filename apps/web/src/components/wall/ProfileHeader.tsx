import type { ReactNode } from "react";
import type { Theme } from "@flexwall/sdk";

/**
 * The top of a wall, read like a profile: a ringed monogram, the title, the
 * handle, the bio, then whatever actions the page offers.
 */
export function ProfileHeader({
  title,
  handle,
  bio,
  theme,
  stats,
  actions,
  as: Heading = "h1",
}: {
  title: string;
  handle: string;
  bio: string;
  theme: Theme;
  stats?: { label: string; value: string }[];
  actions?: ReactNode;
  as?: "h1" | "h2" | "h3" | "h4";
}) {
  const initial = (title.trim() || handle).replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <header className="profile">
      <div className="avatar" aria-hidden="true" style={{ ["--wall-page" as string]: theme.page }}>
        <span style={{ background: theme.tile, color: theme.ink, fontFamily: theme.display.family }}>{initial}</span>
      </div>
      <div>
        <Heading style={{ fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{title}</Heading>
        <div className="handle" style={{ color: theme.muted }}>
          @{handle}
        </div>
        {stats?.length ? (
          <div className="stats">
            {stats.map((s) => (
              <span key={s.label}>
                <b>{s.value}</b> <span style={{ color: theme.muted }}>{s.label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {bio ? <p style={{ color: theme.muted }}>{bio}</p> : null}
      {actions ? <div className="actions">{actions}</div> : null}
    </header>
  );
}
