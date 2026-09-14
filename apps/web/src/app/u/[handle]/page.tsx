import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { wallNumbers } from "@/application/wall-numbers";
import { JsonLd } from "@/components/seo/JsonLd";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { effectiveTheme } from "@/domain/wall";
import { sessionUserId } from "@/presentation/http";
import { wallDescription } from "@/presentation/seo/descriptions";
import { pageMetadata } from "@/presentation/seo/metadata";
import { siteOrigin } from "@/presentation/seo/origin";
import { breadcrumbLd, profilePageLd } from "@/presentation/seo/structured-data";
import { ProfileHeader } from "@/components/wall/ProfileHeader";
import { ShareButton } from "@/components/wall/ShareButton";

type Props = { params: Promise<{ handle: string }> };

/** The wall and its resolved tiles, once per request: metadata and the page share it. */
const load = cache(async (handle: string) => {
  const c = container();
  try {
    const found = await c.getPublicWall.execute({ handle, viewerId: await sessionUserId() });
    const resolved = await c.resolveWall.execute({ tiles: found.wall.tiles, owner: found.owner, surface: "page" });
    return { ...found, ...resolved };
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const { wall, preview, states } = await load(handle);
  const numbers = wallNumbers(wall.tiles, states, container().catalog);
  return {
    ...pageMetadata({
      title: `${wall.title || `@${wall.handle}`} (@${wall.handle})`,
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
  const { wall, entitlements, preview, states, today } = await load(handle);
  // /@Ada_Builds finds @ada-builds: send it to the one address that gets shared and indexed.
  if (decodeURIComponent(handle) !== wall.handle) permanentRedirect(`/@${wall.handle}`);
  const theme = effectiveTheme(wall, c.catalog, entitlements);

  const verifiedCount = Object.values(states).filter((st) => st.status === "ready" && Object.values(st.inputs).some((i) => i.source?.verified)).length;

  return (
    <div className="wall-page" style={wallStyle(theme)}>
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
        <div className="preview-banner">
          Only you can see this: your wall isn&apos;t published. <Link href="/edit">Publish it from the editor</Link>.
        </div>
      ) : null}
      <main className="wall-inner">
        <ProfileHeader
          title={wall.title}
          handle={wall.handle}
          bio={wall.bio}
          theme={theme}
          stats={verifiedCount ? [{ value: String(verifiedCount), label: verifiedCount === 1 ? "verified number" : "verified numbers" }] : undefined}
          actions={
            <>
              <ShareButton url={`${siteOrigin()}/@${wall.handle}`} title={`${wall.title} on Flexwall`} />
              {entitlements.branding ? (
                <Link href={`/r/${wall.handle}`} className="btn btn-small btn-signal">
                  Make your own wall
                </Link>
              ) : null}
            </>
          }
        />
        <WallGrids tiles={wall.tiles} states={states} theme={theme} today={today} catalog={c.catalog} />
        <footer className="wall-footer" style={{ color: theme.muted }}>
          {entitlements.branding ? <Link href={`/r/${wall.handle}`}>Made with Flexwall</Link> : <span />}
          <Link href={`/report?handle=${wall.handle}`}>Report this wall</Link>
        </footer>
      </main>
    </div>
  );
}
