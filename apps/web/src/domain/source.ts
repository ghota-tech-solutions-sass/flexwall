import type { ValueType } from "@flexwall/sdk";
import { isHistoryWindow, type Binding, type HistoryWindow } from "./wall";

/**
 * Where an input can be fed from, as the editor offers it: a value the owner
 * types, a metric, or a number metric's history. One typed shape instead of
 * strings parsed by position; `sourceKey` exists only for keys and comparisons.
 */

/** Values an owner can type by hand. Series and calendars only come from connectors. */
export const TYPEABLE_VALUE_TYPES = ["number", "text"] as const satisfies readonly ValueType[];
export type TypeableValueType = (typeof TYPEABLE_VALUE_TYPES)[number];

export type SourceRef = { kind: "static"; type: TypeableValueType } | { kind: "metric"; connector: string; metric: string } | { kind: "history"; connector: string; metric: string; window: HistoryWindow };

export type SourceKind = SourceRef["kind"];

const SEPARATOR = ":";

export function isTypeable(type: ValueType): type is TypeableValueType {
  return TYPEABLE_VALUE_TYPES.includes(type as TypeableValueType);
}

/** A stable string for one source, for React keys, listbox ids and equality. */
export function sourceKey(ref: SourceRef): string {
  switch (ref.kind) {
    case "static":
      return [ref.kind, ref.type].join(SEPARATOR);
    case "metric":
      return [ref.kind, ref.connector, ref.metric].join(SEPARATOR);
    case "history":
      return [ref.kind, ref.connector, ref.metric, ref.window].join(SEPARATOR);
  }
}

/** Reads a key back, or null for anything `sourceKey` couldn't have produced. */
export function parseSourceKey(key: string): SourceRef | null {
  const [kind, ...parts] = key.split(SEPARATOR);
  if (kind === "static" && parts.length === 1 && isTypeable(parts[0] as ValueType)) return { kind, type: parts[0] as TypeableValueType };
  if (kind === "metric" && parts.length === 2 && parts.every(Boolean)) return { kind, connector: parts[0], metric: parts[1] };
  if (kind === "history" && parts.length === 3 && parts[0] && parts[1] && isHistoryWindow(parts[2])) return { kind, connector: parts[0], metric: parts[1], window: parts[2] };
  return null;
}

/** The source a binding reads from. Static values of a type nobody types map to null. */
export function sourceOfBinding(binding: Binding | undefined): SourceRef | null {
  if (!binding) return null;
  if (binding.kind === "static") return isTypeable(binding.value.type) ? { kind: "static", type: binding.value.type } : null;
  return binding.history ? { kind: "history", connector: binding.connector, metric: binding.metric, window: binding.history } : { kind: "metric", connector: binding.connector, metric: binding.metric };
}

export function sameSource(a: SourceRef | null, b: SourceRef | null): boolean {
  return a === b || (a !== null && b !== null && sourceKey(a) === sourceKey(b));
}

/** The connector behind a source, if any. */
export function connectorOfSource(ref: SourceRef | null): string | null {
  return ref && ref.kind !== "static" ? ref.connector : null;
}
