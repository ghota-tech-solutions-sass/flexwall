import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { container } from "@/composition";
import { DomainError } from "@/domain/errors";
import { effectiveTheme } from "@/domain/wall";
import { sessionUserId } from "@/presentation/http";

type Props = { params: Promise<{ handle: string }> };

async function load(handle: string) {
  const c = container();
  try {
    return await c.getPublicWall.execute({ handle, viewerId: await sessionUserId() });
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const { wall, preview } = await load(handle);
  return {
    title: `${wall.title} (@${wall.handle})`,
    description: wall.bio || `Live numbers from @${wall.handle} on Flexwall.`,
    alternates: { canonical: `/@${wall.handle}` },
    robots: preview ? { index: false, follow: false } : undefined,
  };
}

export default async function PublicWallPage({ params }: Props) {
  const { handle } = await params;
  const c = container();
  const { wall, owner, entitlements, preview } = await load(handle);
  const { states, today } = await c.resolveWall.execute({ tiles: wall.tiles, owner, surface: "page" });
  const theme = effectiveTheme(wall, c.catalog, entitlements);

  return (
    <div className="wall-page" style={wallStyle(theme)}>
      {preview ? (
        <div className="preview-banner">
          Only you can see this: your wall isn&apos;t published. <Link href="/edit">Publish it from the editor</Link>.
        </div>
      ) : null}
      <main className="wall-inner">
        <header className="wall-header">
          <div className="handle" style={{ color: theme.muted }}>@{wall.handle}</div>
          <h1 style={{ fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{wall.title}</h1>
          {wall.bio ? <p style={{ color: theme.muted }}>{wall.bio}</p> : null}
        </header>
        <WallGrids tiles={wall.tiles} states={states} theme={theme} today={today} catalog={c.catalog} />
        <footer className="wall-footer" style={{ color: theme.muted }}>
          {entitlements.branding ? <Link href="/">Made with Flexwall. Make yours →</Link> : <span />}
          <Link href={`/report?handle=${wall.handle}`}>Report this wall</Link>
        </footer>
      </main>
    </div>
  );
}
