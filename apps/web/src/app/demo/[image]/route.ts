import { DEFAULT_DEVICE } from "@/domain/layout";
import { DISPLAY_TIME_ZONE, todayIn } from "@/domain/time";
import { catalog } from "@/plugins/registry";
import { lockscreenImage, placeOnCard, shareCardImage } from "@/rendering/images";
import { demoWall, sampleStates } from "@/rendering/samples";

/**
 * Images of the demo wall for the landing page, sample numbers only. Rendered
 * once at build time and refreshed daily, never per request: drawing them
 * takes seconds, and the page showed an empty phone meanwhile.
 */
export const dynamic = "force-static";
// A day, in seconds. Next.js reads segment config statically, so it has to be a literal.
export const revalidate = 86400;

/** Every image the landing page asks for. Dark ones draw the same wall on `DARK_THEME_ID`, for pages seen in dark mode. */
const IMAGES = {
  "lockscreen.png": { kind: "lockscreen", dark: false },
  "lockscreen-dark.png": { kind: "lockscreen", dark: true },
  "card.png": { kind: "card", dark: false },
  "card-dark.png": { kind: "card", dark: true },
} as const satisfies Record<string, { kind: "lockscreen" | "card"; dark: boolean }>;

type ImageName = keyof typeof IMAGES;

const DARK_THEME_ID = "midnight";

const DAY_SECONDS = 86_400;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const HEADERS = { "Content-Type": "image/png", "Cache-Control": `public, max-age=${DAY_SECONDS}, stale-while-revalidate=${WEEK_SECONDS}` };

const isImage = (name: string): name is ImageName => Object.hasOwn(IMAGES, name);

export function generateStaticParams() {
  return Object.keys(IMAGES).map((image) => ({ image }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ image: string }> }) {
  const { image } = await params;
  if (!isImage(image)) return new Response("not_found", { status: 404 });
  const { kind, dark } = IMAGES[image];
  const today = todayIn(DISPLAY_TIME_ZONE, Date.now());
  const wall = demoWall(today);
  const theme = catalog.theme(dark ? DARK_THEME_ID : wall.theme)!;
  const states = sampleStates(wall.tiles, catalog);
  const res =
    kind === "lockscreen"
      ? await lockscreenImage({
          device: DEFAULT_DEVICE,
          placed: wall.lockscreen.placements.map((p) => ({ tile: wall.tiles.find((t) => t.id === p.tileId)!, box: p.box })),
          states,
          theme,
          catalog,
          today,
          watermark: false,
        })
      : await shareCardImage({ handle: wall.handle, title: wall.title, bio: wall.bio, placed: placeOnCard(wall.tiles), states, theme, catalog, today });
  return new Response(res.body, { headers: HEADERS });
}
