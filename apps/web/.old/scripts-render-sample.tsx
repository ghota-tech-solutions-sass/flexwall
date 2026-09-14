// Renders the landing samples to disk for eyeballing: bun scripts/render-sample.tsx <outdir>
import { writeFileSync } from "node:fs";
import { THEME_IDS } from "@/lib/config";
import { resolveWall } from "@/lib/metrics";
import { renderWallpaper } from "@/lib/render";
import { SAMPLES } from "@/lib/samples";

const out = process.argv[2] ?? ".tmp";
for (const theme of THEME_IDS) {
  const config = SAMPLES[theme];
  const t0 = performance.now();
  const data = await resolveWall({ config, mode: "sample" });
  const buf = Buffer.from(await renderWallpaper(config, data, { watermark: false }).arrayBuffer());
  writeFileSync(`${out}/wall-${theme}.png`, buf);
  console.log(theme, Math.round(performance.now() - t0) + "ms", buf.length + "B");
}
