import { describe, expect, test } from "bun:test";
import { DEVICE_IDS, THEME_IDS } from "@/lib/config";
import { resolveWall } from "@/lib/metrics";
import { renderWallpaper } from "@/lib/render";
import { SAMPLES } from "@/lib/samples";

const PNG = [0x89, 0x50, 0x4e, 0x47];

async function size(buf: ArrayBuffer): Promise<[number, number]> {
  const v = new DataView(buf);
  return [v.getUint32(16), v.getUint32(20)];
}

describe("render", () => {
  test("every theme renders a PNG at device resolution", async () => {
    for (const theme of THEME_IDS) {
      const config = SAMPLES[theme];
      const buf = await renderWallpaper(config, await resolveWall({ config, mode: "sample" }), { watermark: true }).arrayBuffer();
      expect([...new Uint8Array(buf.slice(0, 4))]).toEqual(PNG);
      expect(await size(buf)).toEqual([1206, 2622]);
    }
  }, 30_000);

  test("every device keeps its aspect ratio, and width overrides scale it", async () => {
    for (const device of DEVICE_IDS) {
      const config = { ...SAMPLES.ink, device };
      const data = await resolveWall({ config, mode: "sample" });
      const [w, h] = await size(await renderWallpaper(config, data, { watermark: false, width: 300 }).arrayBuffer());
      expect(w).toBe(300);
      expect(h).toBeGreaterThan(600);
    }
  }, 30_000);
});
