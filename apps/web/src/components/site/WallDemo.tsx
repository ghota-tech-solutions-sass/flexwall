"use client";

import { useState } from "react";
import Link from "next/link";
import core from "@flexwall/plugin-core";
import type { TileState } from "@/application/use-cases/resolve-wall";
import { DEFAULT_THEME_ID, TITLE_MAX, type Wall } from "@/domain/wall";
import { createCatalog } from "@/plugins/catalog";
import { WallGrids, wallStyle } from "@/components/wall/WallView";
import { SHOWCASE_IDS, showcaseTiles } from "@/presentation/wall/showcase";
import { monogram } from "@/presentation/wall/profile";
import { ROUTES } from "@/presentation/routes";

// Only renderers and themes enter the demo bundle; no connector clients or credentials.
const catalog = createCatalog([core], DEFAULT_THEME_ID);
const THEME_IDS = ["daylight", "midnight", "paper", "night", "sunset", "old-money", "editorial", "terminal", "board"];

export function WallDemo({ wall, states, today, signedIn }: { wall: Wall; states: Record<string, TileState>; today: string; signedIn: boolean }) {
  const [title, setTitle] = useState(wall.title);
  const [themeId, setThemeId] = useState(wall.theme);
  const [chartType, setChartType] = useState("bar-chart");
  const [hidden, setHidden] = useState<string[]>([]);
  const theme = catalog.theme(themeId) ?? catalog.defaultTheme();
  const choices = SHOWCASE_IDS.flatMap((id) => wall.tiles.filter((tile) => tile.id === id));
  const tiles = showcaseTiles(wall.tiles, { hidden, chartType });

  return (
    <div className="demo-workspace">
      <section className="demo-controls" aria-label="Customize the sample wall">
        <h2>Make it feel like you.</h2>
        <label className="field"><span>Page title</span><input maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <fieldset><legend>Choose a theme</legend><div className="demo-themes">
          {THEME_IDS.map((id) => <button key={id} className="btn btn-small" type="button" aria-pressed={themeId === id} onClick={() => setThemeId(id)}><span className="demo-swatch" aria-hidden="true" style={{ backgroundColor: catalog.theme(id)?.page, backgroundImage: catalog.theme(id)?.wallpaper }}><i style={{ background: catalog.theme(id)?.tile, borderColor: catalog.theme(id)?.tileBorder }} /><i style={{ background: catalog.theme(id)?.accent }} /><i style={{ background: catalog.theme(id)?.tile, borderColor: catalog.theme(id)?.tileBorder }} /></span><span>{catalog.theme(id)?.name}</span>{catalog.theme(id)?.tier === "pro" ? <small>Pro</small> : null}</button>)}
        </div></fieldset>
        <label className="field"><span>History chart</span><select value={chartType} onChange={(e) => setChartType(e.target.value)}><option value="bar-chart">Bars</option><option value="step-chart">Steps</option><option value="sparkline">Trend</option></select></label>
        <fieldset><legend>Choose what visitors see</legend>
          {choices.map((tile) => <label key={tile.id} className="check"><input type="checkbox" checked={!hidden.includes(tile.id)} onChange={(e) => setHidden((ids) => e.target.checked ? ids.filter((id) => id !== tile.id) : [...ids, tile.id])} />{String(tile.options.label)}</label>)}
        </fieldset>
        <button className="btn btn-small" type="button" onClick={() => { setTitle(wall.title); setThemeId(wall.theme); setHidden([]); setChartType("bar-chart"); }}>Reset demo</button>
        <p className="hint">Sample data only. Changes are a preview and are not saved. Your own wall starts with your own numbers. Some themes and revenue connections require Pro.</p>
        <Link href={signedIn ? ROUTES.edit : ROUTES.login} className="btn btn-signal">{signedIn ? "Open my editor" : "Create my free wall"}</Link>
        <Link href={ROUTES.pricing}>Compare Free and Pro</Link>
      </section>
      <section className="demo-result" aria-label="Sample wall preview" style={{ ...wallStyle(theme), colorScheme: theme.mode }}>
        <div className="preview-caption"><span>@your-name</span><span className="badge">Sample data</span></div>
        <div className="demo-identity">
          <div className="demo-avatar" aria-hidden="true" style={{ background: theme.ink, color: theme.page, fontFamily: theme.display.family }}>{monogram(title, "your-name")}</div>
          <div><span className="demo-kicker" style={{ color: theme.muted }}>A little progress, every day.</span><h2 style={{ fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{title || "Your page title"}</h2></div>
        </div>
        <p style={{ color: theme.muted }}>Building in public, one milestone at a time.</p>
        {tiles.length ? <WallGrids tiles={tiles} states={states} theme={theme} today={today} catalog={catalog} /> : <p className="demo-empty">All sample tiles are hidden. Choose a number to show it here.</p>}
        <p className="hint" style={{ color: theme.muted }}>These are illustrative figures, not a real person’s revenue or activity.</p>
      </section>
    </div>
  );
}
