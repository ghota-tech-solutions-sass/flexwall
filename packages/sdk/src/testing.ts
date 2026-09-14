import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { ConnectorContext, GuardedFetch, GuardedFetchInit } from "./connector";
import { defaultsFor, type FieldValues } from "./fields";
import type { Theme } from "./theme";
import { isValue } from "./values";
import { areaOf, type InputValue, type Surface, type WidgetDef, type WidgetProps } from "./widget";

/**
 * Helpers for plugin tests. Nothing here needs the app: a plugin's test suite
 * runs with `bun test` inside its own folder.
 */

export const testTheme: Theme = {
  id: "test",
  name: "Test",
  tier: "free",
  mode: "dark",
  page: "#0b0b0c",
  tile: "#16161a",
  tileBorder: "#26262c",
  ink: "#f4f4f5",
  muted: "#8b8b93",
  accent: "#ffd23f",
  positive: "#4ade80",
  negative: "#f87171",
  track: "rgba(255,255,255,0.1)",
  heat: ["#1f1f24", "#3b3b44", "#5d5d6a", "#8a8a99", "#c8c8d4"],
  radius: 14,
  display: { family: "Grotesk", weight: 700 },
  body: { family: "Inter", weight: 400 },
};

/** Builds the props the host would pass, with image-style pixel units (1 cell = 100px). */
export function widgetProps<O extends FieldValues>(
  widget: WidgetDef<O>,
  over: { inputs?: Record<string, InputValue["value"]>; options?: Partial<O>; box?: { w: number; h: number }; surface?: Surface; theme?: Theme; today?: string } = {}
): WidgetProps<O> {
  const [w, h] = over.box ? [over.box.w, over.box.h] : widget.size.default;
  const box = { w, h };
  const inputs: Record<string, InputValue> = {};
  for (const [k, v] of Object.entries(over.inputs ?? {})) inputs[k] = { value: v, stale: false };
  return {
    inputs,
    options: { ...(defaultsFor(widget.options) as O), ...over.options } as O,
    box,
    area: areaOf(box, widget.chrome ?? "card"),
    theme: over.theme ?? testTheme,
    surface: over.surface ?? "card",
    u: (n) => n,
    today: over.today ?? "2026-09-14",
  };
}

/**
 * Walks a rendered widget and lists everything Satori would choke on:
 * multi-child elements without display flex, CSS grid, class names, event
 * handlers, hooks-based components. An empty list means the image surfaces
 * will render it.
 */
export function satoriProblems(node: ReactNode, path = "root"): string[] {
  const problems: string[] = [];
  if (Array.isArray(node)) {
    node.forEach((n, i) => problems.push(...satoriProblems(n, `${path}[${i}]`)));
    return problems;
  }
  if (!isValidElement(node)) return problems;
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === "function") {
    // Components are expanded like Satori does: call them with their props.
    const rendered = (el.type as (p: unknown) => ReactNode)(el.props);
    return satoriProblems(rendered, `${path}>${(el.type as { name?: string }).name || "Component"}`);
  }
  if (typeof el.type !== "string") return problems;
  const props = el.props;
  const style = (props.style ?? {}) as Record<string, unknown>;
  const tag = `${path}>${el.type}`;
  if ("className" in props) problems.push(`${tag}: className has no effect on images, use inline styles`);
  for (const key of Object.keys(props)) if (/^on[A-Z]/.test(key)) problems.push(`${tag}: ${key} can't work on images`);
  if (style.display === "grid") problems.push(`${tag}: display grid isn't supported, use Row/Col`);
  const children = ([] as ReactNode[]).concat(props.children as ReactNode).filter((c) => c !== null && c !== undefined && c !== false && c !== "");
  const isSvg = ["svg", "path", "polyline", "rect", "circle", "line", "g", "polygon"].includes(el.type);
  if (!isSvg && children.length > 1 && style.display !== "flex" && style.display !== "none") {
    problems.push(`${tag}: ${children.length} children need display flex`);
  }
  children.forEach((c, i) => problems.push(...satoriProblems(c, `${tag}[${i}]`)));
  return problems;
}

/** A connector context whose network answers from a fixture map. Unknown URLs throw, like a real outage. */
/** A route answers with a fixed body, or a function of the request (to paginate, check headers or bodies). */
export type FakeBody = Record<string, unknown> | unknown[] | string | number | boolean | null;
export type FakeRoute = FakeBody | ((init: GuardedFetchInit | undefined, url: string) => unknown);

export function fakeContext(
  routes: Record<string, FakeRoute>,
  opts: { today?: string; env?: Record<string, string> } = {}
): ConnectorContext & { calls: string[] } {
  const calls: string[] = [];
  const answer = (url: string, init?: GuardedFetchInit) => {
    calls.push(url);
    // Longest matching prefix wins, so ".../balance" doesn't swallow ".../balance_transactions".
    const hit = Object.keys(routes)
      .filter((prefix) => url === prefix || url.startsWith(prefix))
      .sort((a, b) => b.length - a.length)[0];
    if (!hit) throw new Error(`fakeContext: no route for ${url}`);
    const r = routes[hit];
    return typeof r === "function" ? (r as (i: GuardedFetchInit | undefined, u: string) => unknown)(init, url) : r;
  };
  const fetch: GuardedFetch = {
    json: async <T>(url: string, init?: GuardedFetchInit) => answer(url, init) as T,
    text: async (url, init) => String(answer(url, init)),
  };
  return { fetch, today: opts.today ?? "2026-09-14", env: (n) => opts.env?.[n], log: () => {}, calls };
}

export { isValue };
