import { fitFont } from "@flexwall/sdk/ui";
import { provenanceOf } from "./provenance";
import type { CSSProperties, ReactElement } from "react";
import { areaOf, CARD_PADDING_UNITS, DEFAULT_CHROME, type Surface, type Theme, type UnitFn } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { Catalog } from "@/domain/catalog";
import type { Tile } from "@/domain/wall";

/**
 * One tile, for every surface: chrome from the theme, then the widget or the
 * reason it can't draw. Satori-safe, so images and pages share it.
 */

/** Size of the line a tile shows instead of its widget ("Connect Stripe", "Loading…"), in units. */
const PLACEHOLDER_FONT_UNITS = 11;

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
  const chrome = widget?.chrome ?? DEFAULT_CHROME;
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
  const card: CSSProperties = {
    background: theme.tile,
    // A restrained wash gives numbers and goals their own material, on every surface.
    ...((widget?.category === "numbers" || widget?.category === "progress") && theme.radius >= 14 ? { backgroundImage: `linear-gradient(135deg, ${theme.heat[0]} 0%, ${theme.tile} 75%)` } : {}),
    border: `1px solid ${theme.tileBorder}`,
    padding: u(CARD_PADDING_UNITS),
    ...(theme.tileShadow ? { boxShadow: theme.tileShadow } : {}),
  };

  if (!widget) return <div style={{ ...frame, ...card }}>{message("This widget was removed.", theme, u)}</div>;
  if (!state || state.status === "placeholder") {
    return <div style={{ ...frame, ...card, border: `1px dashed ${theme.tileBorder}` }}>{message(state?.message ?? "Loading…", theme, u)}</div>;
  }

  const provenance = provenanceOf(state.inputs);
  const area = areaOf(box, chrome);
  const footerHeight = provenance ? 12 : 0;
  const props = { inputs: state.inputs, options: tile.options, box, area: { ...area, height: area.height - footerHeight }, theme, surface, u, today };
  const body = surface === "page" && widget.renderPage ? widget.renderPage(props) : widget.render(props);
  const trusted = provenance?.kind === "verified" || provenance?.kind === "synced";
  const badge = provenance ? <div title={provenance.detail} aria-label={provenance.detail} style={{ display: "flex", alignItems: "center", gap: u(3), height: u(footerHeight), flexShrink: 0, alignSelf: "flex-start", maxWidth: "100%", paddingTop: trusted ? 0 : u(3), paddingLeft: trusted ? u(3) : 0, paddingRight: trusted ? u(3) : 0, borderRadius: u(4), background: trusted ? theme.track : "transparent", color: trusted ? theme.positive : theme.muted, fontSize: u(fitFont(provenance.label, area.width - 16, 8)), whiteSpace: "nowrap" }}>
      {trusted ? <svg width={u(8)} height={u(8)} viewBox="0 0 16 16" style={{ flexShrink: 0 }}><path d={provenance.kind === "verified" ? "M8 1L14 4V8C14 11 11 14 8 15C5 14 2 11 2 8V4Z" : "M8 1a7 7 0 1 0 0 14a7 7 0 1 0 0-14"} fill={theme.positive} /><path d="M5 8L7 10L11 6" fill="none" stroke={theme.tile} strokeWidth="1.5" /></svg> : null}
      <div style={{ display: "flex", overflow: "hidden" }}>{provenance.label}</div>
    </div> : null;
  return <div style={{ ...(chrome === "card" ? { ...frame, ...card } : frame), flexDirection: "column" }}>
    <div style={{ display: "flex", width: "100%", height: u(area.height - footerHeight), flexShrink: 0 }}>{body}</div>
    {provenance && surface === "page" ? <details className="source-disclosure" style={{ height: u(footerHeight), flexShrink: 0, alignSelf: "flex-start", maxWidth: "100%" }}>
      <summary aria-label={provenance.detail}>{badge}</summary>
      <div className="source-tooltip">{provenance.detail}</div>
    </details> : badge}
  </div>;
}

function message(text: string, theme: Theme, u: UnitFn): ReactElement {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: u(PLACEHOLDER_FONT_UNITS), color: theme.muted }}>
      {text}
    </div>
  );
}
