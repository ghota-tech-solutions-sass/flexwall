import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopBar } from "@/components/Chrome";
import { listPublicWalls, type Wall } from "@/lib/store/walls";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Real Flexwall lock screens, shared by the people who stare at them every morning.",
  alternates: { canonical: "/wall" },
};

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  let walls: Wall[] = [];
  try {
    walls = await listPublicWalls();
  } catch (error) {
    console.error("gallery failed:", error);
  }
  return (
    <div className="page">
      <TopBar />
      <main>
        <div className="prose" style={{ paddingBottom: 24 }}>
          <h1>The wall</h1>
          <p>Lock screens people chose to show. Every number on them is live.</p>
        </div>
        {walls.length === 0 ? (
          <div className="empty">
            <p>Nobody has shared theirs yet. Pro wallpapers can be added from the editor, with one checkbox.</p>
            <Link href="/new" className="btn btn-signal">
              Make yours
            </Link>
          </div>
        ) : (
          <div className="gallery">
            {walls.map((w) => (
              <img key={w.id} src={`/p/${w.id}`} alt={`A ${w.config.theme} Flexwall lock screen`} loading="lazy" />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
