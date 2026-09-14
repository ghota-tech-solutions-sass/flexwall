import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home screen icon: the wall mark from icon.svg, on a full-bleed square iOS rounds itself. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 34, gap: 12, background: "#0c0d10" }}>
        <div style={{ display: "flex", height: 50, borderRadius: 14, background: "#2fb866" }} />
        <div style={{ display: "flex", flex: 1, gap: 12 }}>
          <div style={{ display: "flex", flex: 1, borderRadius: 14, background: "#f5f5f7" }} />
          <div style={{ display: "flex", flex: 1, borderRadius: 14, background: "#5b5c63" }} />
        </div>
      </div>
    ),
    size
  );
}
