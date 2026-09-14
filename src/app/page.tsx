import Link from "next/link";
import { Footer, TopBar } from "@/components/Chrome";
import { HeroStage } from "@/components/HeroStage";
import { PRO_PRICE_LABEL } from "@/lib/site";

// Sample countdowns are dated from "today": regenerate the page hourly so they stay fresh.
export const revalidate = 3600;

const METRICS = [
  { sample: "$4.8k", title: "Your Stripe MRR, live", body: "Connect a read-only key. MRR, last 30 days of revenue or paying customers, redrawn every morning." },
  { sample: "{ }", title: "Any number from your API", body: "Point at a JSON endpoint and a field. Signups, users online, orders today: if it has a URL, it fits." },
  { sample: "47", title: "Your GitHub streak", body: "Read from your public profile every morning. Skip a day and your phone knows." },
  { sample: "43", title: "A countdown", body: "Days until launch, the race, the wedding, the end of the runway." },
  { sample: "71%", title: "How much of the year is gone", body: "The quiet one. It works better than any productivity app." },
  { sample: "$2.3k", title: "A goal you type", body: "Kilos, words, savings. You type the number, the bar does the guilt." },
  { sample: "▦", title: "A contribution heatmap", body: "Your last five months of commits, drawn under the numbers, plus stars and followers." },
];

export default function Home() {
  return (
    <div className="page">
      <TopBar />

      <main>
        <section className="hero">
          <div>
            <h1>Your lock screen, keeping score.</h1>
            <p className="hero-lede">
              Put your goal, your streak and your countdown behind the clock. An iPhone Shortcut redraws it every
              morning. No app to install.
            </p>
            <div className="hero-actions">
              <Link href="/new" className="btn btn-signal">
                Make my wallpaper
              </Link>
              <p>Free. {PRO_PRICE_LABEL} once for every theme.</p>
            </div>
          </div>
          <HeroStage />
        </section>

        <section className="section" aria-labelledby="how">
          <h2 id="how">On your phone in three minutes</h2>
          <p className="section-lede">
            Flexwall draws a fresh image for you each morning. A Shortcut automation picks it up and sets it as
            your wallpaper while you sleep.
          </p>
          <ol className="steps">
            <li>
              <h3>Pick what to show</h3>
              <p>A big number up top, up to three small ones under it, a theme. The preview is live.</p>
            </li>
            <li>
              <h3>Add one automation</h3>
              <p>Two actions in the Shortcuts app: get the image from your link, set it as wallpaper. Daily at 7:00.</p>
            </li>
            <li>
              <h3>Wake up to it</h3>
              <p>New numbers every morning. Change them on the site any time, the phone follows.</p>
            </li>
          </ol>
        </section>

        <section className="section" aria-labelledby="what">
          <h2 id="what">What it can show</h2>
          <p className="section-lede">Mix them however you like. Keys you connect are encrypted and only ever read.</p>
          <ul className="metric-list">
            {METRICS.map((m) => (
              <li key={m.title}>
                <span className="sample" aria-hidden="true">
                  {m.sample}
                </span>
                <div>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="section" aria-labelledby="price">
          <h2 id="price">Free, or {PRO_PRICE_LABEL} once</h2>
          <p className="section-lede">No subscription. Pro is per wallpaper and it doesn&apos;t expire.</p>
          <div className="pricing">
            <div className="plan">
              <h3>Free</h3>
              <p className="price">$0</p>
              <ul>
                <li>GitHub, countdowns, goals and the heatmap</li>
                <li>Ink and Paper themes</li>
                <li>Refreshed daily by your Shortcut</li>
                <li>A small flexwall.lol at the bottom</li>
              </ul>
              <Link href="/new" className="btn">
                Make my wallpaper
              </Link>
            </div>
            <div className="plan pro">
              <h3>Pro</h3>
              <p className="price">
                {PRO_PRICE_LABEL} <small>one time</small>
              </p>
              <ul>
                <li>Everything in Free</li>
                <li>Live Stripe and your own API</li>
                <li>Old Money, Terminal, Sunset and Editorial themes</li>
                <li>No watermark</li>
                <li>Show it off in the gallery, if you want</li>
              </ul>
              <Link href="/new" className="btn btn-signal">
                Start free, upgrade in the editor
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
