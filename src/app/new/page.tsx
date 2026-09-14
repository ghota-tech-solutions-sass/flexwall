import type { Metadata } from "next";
import { Footer, TopBar } from "@/components/Chrome";
import { Editor } from "@/components/Editor";

export const metadata: Metadata = {
  title: "Make your wallpaper",
  description: "Pick a goal, a countdown or your GitHub streak and get a lock screen that updates itself every morning.",
  alternates: { canonical: "/new" },
};

export default function NewPage() {
  return (
    <div className="page">
      <TopBar cta={false} />
      <main>
        <Editor />
      </main>
      <Footer />
    </div>
  );
}
