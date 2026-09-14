# Writing a theme

A theme is a set of tokens. Widgets read them; nothing else changes.

```ts
import { defineTheme } from "@flexwall/sdk";

export const midnight = defineTheme({
  id: "midnight",
  name: "Midnight",
  tier: "pro",
  mode: "dark",
  page: "radial-gradient(circle at 50% 0%, #1b2440 0%, #05070d 70%)",
  tile: "rgba(255,255,255,0.04)",
  tileBorder: "rgba(255,255,255,0.08)",
  ink: "#e8ecf8",
  muted: "#7d869f",
  accent: "#7aa2ff",
  positive: "#5ee6a0",
  negative: "#ff8a7a",
  track: "rgba(232,236,248,0.1)",
  heat: ["#111726", "#1d2e5c", "#2c4a9a", "#4d72d6", "#7aa2ff"],
  radius: 18,
  display: { family: "Grotesk", weight: 700 },
  body: { family: "Inter", weight: 400 },
});
```

Add it to a plugin's `themes` array.

| Token | Used for |
|---|---|
| `mode` | `"dark"` or `"light"`: how chrome around tiles is tinted, and which way the iOS clock reads. |
| `page` | Behind the whole wall. Colors or linear/radial gradients. |
| `tile`, `tileBorder` | Card background and border. |
| `ink`, `muted` | Main and secondary text. |
| `accent` | Bars, lines, highlights. |
| `positive`, `negative` | Up and down changes. |
| `track` | The empty part of bars. |
| `heat` | Five heatmap levels, empty to busiest. |
| `radius` | Tile corners, in units (a hundredth of a cell). |
| `display`, `body` | Font family and weight. Families: `Grotesk`, `Inter`, `Serif`, `Mono`. |

Rules:

- Everything must be Satori-safe: plain colors, `rgba()`, linear and radial gradients. No `backdrop-filter`, no images.
- Check contrast on the page and on the lock screen: `muted` text on `tile` should stay readable.
- `tier: "pro"` themes preview for everyone and render publicly for paying owners.
