import type { CSSProperties, ReactElement } from "react";
import { areaOf, CARD_PADDING_UNITS, type Surface, type Theme, type UnitFn } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { Catalog } from "@/domain/catalog";
import type { Tile } from "@/domain/wall";

/**
 * One tile, for every surface: chrome from the theme, then the widget or the
 * reason it can't draw. Satori-safe, so images and pages share it.
 */

export interface TileRenderProps {
  tile: Tile;
  state: TileState | undefined;
  box: { w: number; h: number };
  theme: Theme;
  surface: Surface;
  u: UnitFn;
  today: string;
  catalog: Catalog;
}

export function TileBody({ tile, state, box, theme, surface, u, today, catalog }: TileRenderProps): ReactElement {
  const widget = catalog.widget(tile.widget);
  const chrome = widget?.chrome ?? "card";
  const frame: CSSProperties = {
    display: "flex",
    width: "100%",
    height: "100%",
    // No overflow: hidden. Satori turns it into a clip path on every descendant,
    // which took a 4-week heatmap from 20 ms to 5 s. Widgets fit their `area`.
    borderRadius: u(theme.radius),
    color: theme.ink,
    fontFamily: theme.body.family,
  };
  const card: CSSProperties = { background: theme.tile, border: `1px solid ${theme.tileBorder}`, padding: u(CARD_PADDING_UNITS) };

  if (!widget) return <div style={{ ...frame, ...card }}>{message("This widget was removed.", theme, u)}</div>;
  if (!state || state.status === "placeholder") {
    return <div style={{ ...frame, ...card, border: `1px dashed ${theme.tileBorder}` }}>{message(state?.message ?? "Loading…", theme, u)}</div>;
  }

  const props = { inputs: state.inputs, options: tile.options, box, area: areaOf(box, chrome), theme, surface, u, today };
  const body = surface === "page" && widget.renderPage ? widget.renderPage(props) : widget.render(props);
  return <div style={chrome === "card" ? { ...frame, ...card } : frame}>{body}</div>;
}

function message(text: string, theme: Theme, u: UnitFn): ReactElement {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: u(11), color: theme.muted }}>
      {text}
    </div>
  );
}
