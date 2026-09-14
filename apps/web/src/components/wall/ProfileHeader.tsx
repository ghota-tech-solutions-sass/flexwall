import type { ReactNode } from "react";
import type { Theme } from "@flexwall/sdk";
import { formatHandle } from "@/domain/handle";
import { themeVariables, WALL_VARIABLES } from "@/presentation/theme-vars";
import { monogram } from "@/presentation/wall/profile";

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
  const initial = monogram(title, handle);
  return (
    <header className="profile">
      <div className="avatar" aria-hidden="true" style={themeVariables(theme, { page: WALL_VARIABLES.page })}>
        <span style={{ background: theme.tile, color: theme.ink, fontFamily: theme.display.family }}>{initial}</span>
      </div>
      <div>
        <Heading style={{ fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{title}</Heading>
        <div className="handle" style={{ color: theme.muted }}>
          {formatHandle(handle)}
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
