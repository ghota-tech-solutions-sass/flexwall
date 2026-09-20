import { Footer, TopBar } from "@/components/site/Chrome";
import { WallDemo } from "@/components/site/WallDemo";
import { todayIn } from "@/domain/time";
import { catalog } from "@/plugins/registry";
import { sessionUserId } from "@/presentation/http";
import { ROUTES } from "@/presentation/routes";
import { pageMetadata } from "@/presentation/seo/metadata";
import { demoWall, sampleStates } from "@/rendering/samples";

export const metadata = pageMetadata({ title: "Try the demo", description: "Try a Flexwall page without signing up. Change the theme, edit the title and choose your tiles with clearly labeled sample data.", path: ROUTES.demo });

export default async function DemoPage() {
  const today = todayIn("UTC", Date.now());
  const wall = demoWall(today);
  const signedIn = Boolean(await sessionUserId());
  return <div className="page">
    <TopBar signedIn={signedIn} />
    <main id="main">
      <header className="page-head dotted demo-heading"><span className="eyebrow">Interactive preview · no sign-up</span><h1 className="display">Your wall starts here.</h1><p>Try the look. Choose the numbers. Connect your real accounts when you create your own wall.</p></header>
      <WallDemo wall={wall} states={sampleStates(wall.tiles, catalog)} today={today} signedIn={signedIn} />
    </main>
    <Footer />
  </div>;
}
