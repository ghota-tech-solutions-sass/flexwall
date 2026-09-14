import { definePlugin } from "@flexwall/sdk";
import { heatmap, sparkline } from "./widgets/charts";
import { link, note } from "./widgets/content";
import { stat } from "./widgets/stat";
import { countdown, timeLeft } from "./widgets/time";
import { themes } from "./themes";

export default definePlugin({
  id: "core",
  name: "Core",
  description: "The widgets and themes every wall starts with.",
  author: { name: "Flexwall", url: "https://flexwall.lol" },
  widgets: [stat, sparkline, heatmap, countdown, timeLeft, note, link],
  themes,
});

export { heatmap, sparkline, link, note, stat, countdown, timeLeft, themes };
