import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { wallNumbers } from "@/application/wall-numbers";
import { FlagIcon, PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import { JsonLd } from "@/components/seo/JsonLd";
import { Logo } from "@/components/site/Chrome";
import { WallGrids, wallStyle, wallVars } from "@/components/wall/WallView";
import { WallProfile } from "@/components/wall/WallProfile";
import { ShareButton } from "@/components/wall/ShareButton";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { effectiveTheme } from "@/domain/wall";
import { sessionUserId } from "@/presentation/http";
import { wallDescription } from "@/presentation/seo/descriptions";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { breadcrumbLd, profilePageLd } from "@/presentation/seo/structured-data";
import { updatedAgo } from "@/presentation/explore/boards";
import { joinedLabel, verifiedCount, wallIdentity } from "@/presentation/wall/profile";
import "./wall-page.css";

type Props = { params: Promise<{ handle: string }> };

/** The wall and its resolved tiles, once per request: metadata and the page share it. */
const load = cache(async (handle: string) => {
  const c = container();
  try {
    const viewerId = await sessionUserId();
    const found = await c.getPublicWall.execute({ handle, viewerId });
    const resolved = await c.resolveWall.execute({ tiles: found.wall.tiles, owner: found.owner, surface: "page" });
    return { ...found, ...resolved, viewerId };
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const { wall, preview, states } = await load(handle);
  const numbers = wallNumbers(wall.tiles, states, container().catalog);
  const identity = wallIdentity(wall.title, wall.handle);
  return {
    ...pageMetadata({
      title: identity.showHandle ? `${identity.name} (@${wall.handle})` : identity.name,
      description: wallDescription({ handle: wall.handle, title: wall.title, bio: wall.bio, numbers }),
      path: `/@${wall.handle}`,
      type: "profile",
    }),
    robots: preview ? { index: false, follow: false } : undefined,
  };
}

export default async function PublicWallPage({ params }: Props) {
  const { handle } = await params;
  const c = container();
  const { wall, entitlements, preview, states, today, viewerId } = await load(handle);
  // /@Ada_Builds finds @ada-builds: send it to the one address that gets shared and indexed.
  if (decodeURIComponent(handle) !== wall.handle) permanentRedirect(`/@${wall.handle}`);
  const theme = effectiveTheme(wall, c.catalog, entitlements);
  const owner = viewerId === wall.ownerId;
  const url = `${siteOrigin()}/@${wall.handle}`;

  return (
    <div className="wall-page" data-mode={theme.mode} style={{ ...wallStyle(theme), ...wallVars(theme) }}>
      {preview ? null : (
        <JsonLd
          data={[
            profilePageLd({ origin: siteOrigin(), handle: wall.handle, title: wall.title, bio: wall.bio, createdAt: wall.createdAt, updatedAt: wall.updatedAt }),
            breadcrumbLd(siteOrigin(), [
              { name: "Flexwall", path: "/" },
              { name: `@${wall.handle}`, path: `/@${wall.handle}` },
            ]),
          ]}
        />
      )}
      {preview ? (
        <div className="wp-preview" role="status">
          <span className="wp-preview-dot" aria-hidden="true" />
          <p>
            <strong>Preview.</strong> Only you can see this wall until it&apos;s published.
          </p>
          <Link href="/edit" className="wp-btn wp-btn-small">
            <span>
              Publish<span className="wp-wide"> in the editor</span>
            </span>
          </Link>
        </div>
      ) : null}
      <main className="wall-inner">
        <WallProfile
          title={wall.title}
          handle={wall.handle}
          bio={wall.bio}
          theme={theme}
          verified={verifiedCount(states)}
          updated={updatedAgo(wall.updatedAt, Date.now())}
          joined={joinedLabel(wall.createdAt)}
          actions={
            <>
              <ShareButton url={url} title={`${wallIdentity(wall.title, wall.handle).name} on Flexwall`} className="wp-btn" />
              {entitlements.branding && !owner ? (
                <Link href={`/r/${wall.handle}`} className="wp-btn wp-btn-ink">
                  Make your own wall
                </Link>
              ) : null}
            </>
          }
        />
        <WallGrids tiles={wall.tiles} states={states} theme={theme} today={today} catalog={c.catalog} />
        <footer className="wp-footer">
          {entitlements.branding ? (
            <Link href={`/r/${wall.handle}`} className="wp-made" style={{ ["--bg" as string]: theme.tile, ["--muted" as string]: theme.muted }}>
              <Logo size={18} />
              Made with Flexwall
            </Link>
          ) : (
            <span />
          )}
          <Link href={`/report?handle=${wall.handle}`} className="wp-report">
            <FlagIcon size={14} aria-hidden="true" />
            Report this wall
          </Link>
        </footer>
      </main>
      {owner ? (
        <Link href="/edit" className="wp-owner">
          <PencilSimpleIcon size={16} weight="bold" aria-hidden="true" />
          Edit wall
        </Link>
      ) : null}
    </div>
  );
}
