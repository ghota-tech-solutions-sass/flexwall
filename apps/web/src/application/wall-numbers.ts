import type { NumberValue } from "@flexwall/sdk";
import type { Catalog } from "@/domain/catalog";
import type { Binding, Tile } from "@/domain/wall";
import type { TileState } from "./use-cases/resolve-wall";

export interface WallNumber {
  tile: Tile;
  binding: Extract<Binding, { kind: "metric" }>;
  value: NumberValue;
  /** Read from the owner's own account, not typed. */
  verified: boolean;
  /** What the owner calls it on the tile, else the metric's name. */
  label: string;
}

/** The numbers a set of resolved tiles shows, in tile order, from connectors only. */
export function wallNumbers(tiles: readonly Tile[], states: Record<string, TileState>, catalog: Catalog): WallNumber[] {
  return tiles.flatMap((tile) => {
    const state = states[tile.id];
    if (state?.status !== "ready") return [];
    return Object.entries(tile.inputs).flatMap(([key, binding]) => {
      const input = state.inputs[key];
      if (binding.kind !== "metric" || !input || input.value.type !== "number") return [];
      const label = String(tile.options.label || catalog.metric(binding.connector, binding.metric)?.name || "");
      return [{ tile, binding, value: input.value, verified: Boolean(input.source?.verified), label }];
    });
  });
}
