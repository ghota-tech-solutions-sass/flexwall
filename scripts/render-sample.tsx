// Renders sample wallpapers to disk for eyeballing: bun scripts/render-sample.tsx <outdir>
import { writeFileSync } from "node:fs";
import { DEFAULT_CONFIG, THEME_IDS, type WallConfig } from "@/lib/config";
import { resolveWall } from "@/lib/metrics";
import { renderWallpaper } from "@/lib/render";

const out = process.argv[2] ?? ".tmp";
const base: WallConfig = { ...DEFAULT_CONFIG, heatmap: process.argv[3] ?? "", tz: "Europe/Paris" };
for (const theme of THEME_IDS) {
  const config = { ...base, theme };
  const t0 = performance.now();
  const data = await resolveWall(config);
  const res = renderWallpaper(config, data, { watermark: theme === "ink" || theme === "paper" });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${out}/wall-${theme}.png`, buf);
  console.log(theme, Math.round(performance.now() - t0) + "ms", buf.length + "B", JSON.stringify(process.memoryUsage().rss / 1e6 | 0) + "MB rss");
}
