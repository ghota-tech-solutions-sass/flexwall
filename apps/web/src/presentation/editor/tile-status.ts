import { formatValue, type InputValue } from "@flexwall/sdk";
import type { TileState } from "@/application/use-cases/resolve-wall";

/** How a status line is colored: waiting, needs the owner, needs Pro, degraded, verified, live. */
export const STATUS_TONES = ["wait", "action", "pro", "warn", "ok", "live"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

type PlaceholderReason = Extract<TileState, { status: "placeholder" }>["reason"];

const TONE_BY_REASON: Record<PlaceholderReason, StatusTone> = { connect: "action", pro: "pro", unavailable: "warn" };

/** Longest value shown next to the status before it's cut. */
export const STATUS_VALUE_MAX_CHARS = 22;

export interface TileStatus {
  tone: StatusTone;
  label: string;
  value: string | null;
}

/** One line saying what a tile shows right now, so the owner never guesses why a tile is blank. */
export function tileStatus(state: TileState | undefined): TileStatus | null {
  if (!state) return { tone: "wait", label: "Loading the value…", value: null };
  if (state.status === "placeholder") return { tone: TONE_BY_REASON[state.reason], label: state.reason === "connect" ? "Waiting for an account" : state.message, value: null };
  const first = Object.values(state.inputs)[0];
  if (!first) return null;
  if (first.stale) return { tone: "warn", label: "Last known value", value: preview(first) };
  if (!first.source) return { tone: "live", label: "Typed by you", value: preview(first) };
  return first.source.verified ? { tone: "ok", label: `Verified by ${first.source.name}`, value: preview(first) } : { tone: "live", label: `Live from ${first.source.name}`, value: preview(first) };
}

function preview({ value }: InputValue): string {
  switch (value.type) {
    case "number":
      return formatValue(value);
    case "text":
      return value.value.length > STATUS_VALUE_MAX_CHARS ? `${value.value.slice(0, STATUS_VALUE_MAX_CHARS - 1)}…` : value.value;
    case "series":
      return `${value.points.length} points`;
    case "calendar":
      return `${value.days.length} days`;
  }
}
