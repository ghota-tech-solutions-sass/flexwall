import type { CSSProperties } from "react";
import type { Theme } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";
import type { Catalog } from "@/domain/catalog";
import { mobileLayout, type Box } from "@/domain/layout";
import type { Tile } from "@/domain/wall";
import { MotionScope } from "@/components/motion/MotionScope";
import { TileBody } from "@/rendering/tile";

/**
 * A wall as a web page: a 4-column grid on desktop and the derived 2-column
 * one on phones, both server-rendered. Tiles are drawn twice (hidden by CSS
 * per breakpoint) because widgets lay themselves out from their size in cells.
 */

const webUnits = (n: number) => `calc(var(--u) * ${Math.round(n * 1000) / 1000})`;

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
        const sources = state?.status === "ready" ? Object.values(state.inputs).flatMap((i) => (i.source?.verified ? [i.source.name] : [])) : [];
        return (
          <div key={tile.id} className="wall-tile" style={{ gridColumn: `${box.x + 1} / span ${box.w}`, gridRow: `${box.y + 1} / span ${box.h}` }}>
            <TileBody tile={tile} state={state} box={{ w: box.w, h: box.h }} theme={rest.theme} surface="page" u={webUnits} today={rest.today} catalog={rest.catalog} />
            {sources.length ? (
              <span className="verified" style={{ background: rest.theme.tile, color: rest.theme.ink, border: `1px solid ${rest.theme.tileBorder}` }} title={`Read from the owner's ${sources[0]} account`}>
                ✓ {sources[0]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function WallGrids(props: WallViewProps) {
  const desktop = props.tiles.map((tile) => ({ tile, box: tile.layout }));
  const mobile = mobileLayout(props.tiles).map(({ item, box }) => ({ tile: item, box }));
  return (
    <MotionScope className="wall-frame" tiles>
      <Grid {...props} placed={desktop} variant="desktop" />
      <Grid {...props} placed={mobile} variant="mobile" />
    </MotionScope>
  );
}

/** Colors and fonts for the page around the grid. */
export function wallStyle(theme: Theme): CSSProperties {
  return { backgroundColor: theme.page, ...(theme.wallpaper ? { backgroundImage: theme.wallpaper } : {}), color: theme.ink, fontFamily: theme.body.family };
}
