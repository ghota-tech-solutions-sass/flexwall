import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopBar } from "@/components/Chrome";
import { ShortcutSteps } from "@/components/ShortcutSteps";

export const metadata: Metadata = {
  title: "Setup guide",
  description: "How to make your iPhone set a Flexwall image as its lock screen every morning, with one Shortcuts automation.",
  alternates: { canonical: "/setup" },
};

export default function SetupPage() {
  return (
    <div className="page">
      <TopBar />
      <main className="prose">
        <h1>Set it up on your iPhone</h1>
        <p>
          You need the image link from your wallpaper page. <Link href="/new">Make a wallpaper</Link> first if you
          don&apos;t have one. The automation takes about three minutes and runs on its own after that.
        </p>

        <h2>The automation</h2>
        <ShortcutSteps />

        <h2>If it doesn&apos;t change</h2>
        <ul>
          <li>
            Check that <b>Run Immediately</b> is selected. With <b>Run After Confirmation</b> iOS waits for a tap.
          </li>
          <li>
            iOS only swaps a <b>photo</b> lock screen. If yours uses a Photo Shuffle, Astronomy or Emoji wallpaper, set any
            photo as wallpaper once, then run the shortcut.
          </li>
          <li>Low Power Mode can delay automations. It catches up when you unlock.</li>
          <li>
            Open your image link in Safari. If you see your wallpaper, the link is fine and the problem is in the
            shortcut.
          </li>
        </ul>

        <h2>Want fresher numbers?</h2>
        <p>
          Add a second automation with the same two actions: at noon, or when you open an app you use every day.
          Flexwall redraws the image every time it&apos;s asked.
        </p>

        <h2>Android</h2>
        <p>
          Any automation app that can download an image and set it as wallpaper works, like MacroDroid or Tasker. Pick
          the Android size in the editor.
        </p>
      </main>
      <Footer />
    </div>
  );
}
