import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home screen icon: the lock screen phone mark from icon.svg, on a full-bleed square iOS rounds itself. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#0d0f1f" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 92, height: 144, borderRadius: 22, border: "7px solid #eef0ff", background: "#0e1330", paddingTop: 12 }}>
          <div style={{ display: "flex", width: 26, height: 7, borderRadius: 4, background: "#eef0ff" }} />
          <div style={{ display: "flex", flexDirection: "column", width: 56, marginTop: 42, gap: 10 }}>
            <div style={{ display: "flex", width: 56, height: 10, borderRadius: 5, background: "#ffd23f" }} />
            <div style={{ display: "flex", width: 36, height: 10, borderRadius: 5, background: "#8e95c7" }} />
          </div>
        </div>
      </div>
    ),
    size
  );
}
