import { useState } from "react";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { catalog } from "@/plugins/registry";
import { useEditor } from "./EditorContext";
import { useEditorTheme } from "./WallCanvas";

/** Renders the current draft immediately; previewing never publishes or changes its layout. */
export function EditorPreview() {
  const handle = useEditor((s) => s.handle);
  const draft = useEditor((s) => s.draft);
  const states = useEditor((s) => s.states);
  const today = useEditor((s) => s.today);
  const theme = useEditorTheme();
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const tiles = draft.tiles.filter((tile) => tile.visibility === "public");
  return <div className="ed-preview-wrap">
    <div className="ed-segment" role="radiogroup" aria-label="Preview size">{(["desktop","phone"] as const).map((value) => <button key={value} role="radio" aria-checked={device === value} onClick={() => setDevice(value)}>{value === "desktop" ? "Desktop" : "Phone"}</button>)}</div>
    <p className="ed-note">Draft preview · only public widgets are shown</p>
    <div className="ed-live-preview" data-device={device} style={wallStyle(theme)}>
      <h1 style={{ fontFamily: theme.display.family }}>{draft.title || `@${handle}`}</h1>
      {draft.bio ? <p style={{ color: theme.muted }}>{draft.bio}</p> : null}
      {tiles.length ? <WallGrids tiles={tiles} states={states} theme={theme} today={today} catalog={catalog} /> : <p>Add a public widget to see your wall here.</p>}
    </div>
  </div>;
}
