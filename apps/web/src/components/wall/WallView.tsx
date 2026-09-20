import type { CSSProperties } from "react";
import { themeBackground, type Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { Catalog } from "@/domain/catalog";
import { mobileLayout, type Box } from "@/domain/layout";
import type { Tile } from "@/domain/wall";
import { MotionScope } from "@/components/motion/MotionScope";
import { themeVariables, WALL_VARIABLES, type CssVariable } from "@/presentation/theme-vars";
import { TileBody } from "@/rendering/tile";

/**
 * A wall as a web page: a 4-column grid on desktop and the derived 2-column
 * one on phones, both server-rendered. Tiles are drawn twice (hidden by CSS
 * per breakpoint) because widgets lay themselves out from their size in cells.
 */

/** Set by the grid's CSS to one unit in pixels, from the tile's container width. */
const UNIT_VARIABLE: CssVariable = "--u";
/** Unit multipliers are printed to a thousandth: enough for a pixel, short enough for the HTML. */
const UNIT_PRECISION = 1000;

const webUnits = (n: number) => `calc(var(${UNIT_VARIABLE}) * ${Math.round(n * UNIT_PRECISION) / UNIT_PRECISION})`;

interface WallViewProps {
  tiles: Tile[];
  states: Record<string, TileState>;
  theme: Theme;
  today: string;
  catalog: Catalog;
}

function Grid({ placed, variant, ...rest }: WallViewProps & { placed: { tile: Tile; box: Box }[]; variant: "desktop" | "mobile" }) {
  return (
    <div className={`wall-grid ${variant}`}>
      {placed.map(({ tile, box }) => {
        const state = rest.states[tile.id];
        return (
          <div key={tile.id} className="wall-tile" style={{ gridColumn: `${box.x + 1} / span ${box.w}`, gridRow: `${box.y + 1} / span ${box.h}` }}>
            <TileBody tile={tile} state={state} box={{ w: box.w, h: box.h }} theme={rest.theme} surface="page" u={webUnits} today={rest.today} catalog={rest.catalog} />
          </div>
        );
      })}
    </div>
  );
}

export function WallGrids({ animate = true, ...props }: WallViewProps & { animate?: boolean }) {
  const desktop = props.tiles.map((tile) => ({ tile, box: tile.layout }));
  const mobile = mobileLayout(props.tiles).map(({ item, box }) => ({ tile: item, box }));
  const grids = <>
      <Grid {...props} placed={desktop} variant="desktop" />
      <Grid {...props} placed={mobile} variant="mobile" />
    </>;
  return <MotionScope className="wall-frame" tiles motion={animate}>{grids}</MotionScope>;
}

/** Colors and fonts for the page around the grid. */
export function wallStyle(theme: Theme): CSSProperties {
  return { ...themeBackground(theme), color: theme.ink, fontFamily: theme.body.family };
}

/** The theme as CSS variables, for the chrome a page draws around the tiles. */
export function wallVars(theme: Theme): CSSProperties {
  return themeVariables(theme, WALL_VARIABLES);
}
