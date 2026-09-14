import type { Metadata } from "next";
import { Footer, TopBar } from "@/components/Chrome";
import { Editor } from "@/components/Editor";

// Private links: never indexed, never leaked through the referrer.
export const metadata: Metadata = {
  title: "Your wallpaper",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page">
      <TopBar cta={false} />
      <main>
        <Editor id={id} />
      </main>
      <Footer />
    </div>
  );
}
