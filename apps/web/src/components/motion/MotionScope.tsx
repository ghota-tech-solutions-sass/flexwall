"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { easeOutExpo, formatFigure, parseFigure } from "@/presentation/motion/figures";

const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Share of the scope that must be on screen before anything moves. */
const VISIBLE_THRESHOLD = 0.2;

/**
 * The choreography, in milliseconds. Each tile starts `tileStagger` after the
 * previous one; inside a tile, lines, bars and heatmaps follow its figures by
 * their own offsets so the eye reads the number first.
 */
const TIMING = {
  count: { start: 120, stagger: 90, duration: 1100 },
  draw: { start: 200, stagger: 90, duration: 1300 },
  tile: { start: 80, stagger: 70, drawAfter: 120, fillAfter: 160, lightAfter: 100 },
  fill: { duration: 1200 },
  cell: { duration: 500, stagger: 12 },
} as const;

/** Text smaller than this is a label or small print, not a figure to count. */
const FIGURE_MIN_FONT_PX = 18;

/** What a heatmap looks like in the DOM: at least this many columns of at least this many cells. */
const HEATMAP_SHAPE = { columns: 20, cells: 5 } as const;

/** How far a heatmap cell rises as it lights up, in pixels. */
const CELL_RISE_PX = 4;

/**
 * Brings live numbers to life once, when they scroll into view: figures count
 * up, lines draw from left to right, bars fill, heatmap cells light up.
 *
 * It reads the rendered DOM instead of asking widgets for hooks, so every
 * widget, community ones included, gets it without changing how images are
 * drawn. Elements marked `data-count` or `data-draw` are animated explicitly.
 * Nothing moves when the system asks for reduced motion.
 */
export function MotionScope({ children, className, tiles = false, style }: { children: ReactNode; className?: string; tiles?: boolean; style?: React.CSSProperties }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        animate(el, tiles);
      },
      { threshold: VISIBLE_THRESHOLD }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tiles]);

  return (
    <div ref={root} className={className} style={style}>
      {children}
    </div>
  );
}

function animate(root: HTMLElement, tiles: boolean) {
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el, i) => countUp(el, TIMING.count.start + i * TIMING.count.stagger));
  root.querySelectorAll<SVGElement>("[data-draw]").forEach((el, i) => draw(el, TIMING.draw.start + i * TIMING.draw.stagger));
  if (!tiles) return;
  root.querySelectorAll<HTMLElement>(".wall-tile").forEach((tile, i) => {
    if (tile.offsetParent === null) return; // the other breakpoint's copy
    const delay = TIMING.tile.start + i * TIMING.tile.stagger;
    leafFigures(tile).forEach((el) => countUp(el, delay));
    tile.querySelectorAll<SVGElement>("svg").forEach((svg) => draw(svg, delay + TIMING.tile.drawAfter));
    bars(tile).forEach((bar) => fill(bar, delay + TIMING.tile.fillAfter));
    heatmaps(tile).forEach((cells) => lightUp(cells, delay + TIMING.tile.lightAfter));
  });
}

/** Leaf elements whose text is one big figure: labels and small print are left alone. */
function leafFigures(tile: HTMLElement): HTMLElement[] {
  return [...tile.querySelectorAll<HTMLElement>("div, span, b")].filter((el) => {
    if (el.childElementCount > 0 || !parseFigure(el.textContent ?? "")) return false;
    return Number.parseFloat(getComputedStyle(el).fontSize) >= FIGURE_MIN_FONT_PX;
  });
}

function countUp(el: HTMLElement, delay: number) {
  const final = el.textContent ?? "";
  const figure = parseFigure(final);
  if (!figure || figure.value === 0) return;
  const duration = TIMING.count.duration;
  el.style.fontVariantNumeric = "tabular-nums";
  el.textContent = formatFigure(figure, 0);
  const start = performance.now() + delay;
  const step = (now: number) => {
    const t = Math.max(0, (now - start) / duration);
    if (t >= 1) {
      el.textContent = final;
      return;
    }
    const value = figure.value * easeOutExpo(t);
    el.textContent = formatFigure(figure, figure.decimals ? value : Math.round(value));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Lines and areas reveal left to right, like a chart being drawn. */
function draw(el: SVGElement, delay: number) {
  el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: TIMING.draw.duration, delay, easing: SPRING, fill: "backwards" });
}

/** Bars are a filled child inside a clipped track: grow the fill from the left. */
function bars(tile: HTMLElement): HTMLElement[] {
  return [...tile.querySelectorAll<HTMLElement>("div")].filter((el) => el.style.width.endsWith("%") && el.parentElement?.style.overflow === "hidden");
}

function fill(el: HTMLElement, delay: number) {
  el.style.transformOrigin = "left center";
  el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: TIMING.fill.duration, delay, easing: SPRING, fill: "backwards" });
}

/** A heatmap is a row of columns of many equal cells: light them column by column. */
function heatmaps(tile: HTMLElement): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  tile.querySelectorAll<HTMLElement>("div").forEach((el) => {
    const columns = [...el.children] as HTMLElement[];
    if (columns.length < HEATMAP_SHAPE.columns || !columns.every((c) => c.childElementCount >= HEATMAP_SHAPE.cells)) return;
    groups.push(columns);
  });
  return groups;
}

function lightUp(columns: HTMLElement[], delay: number) {
  columns.forEach((column, i) => {
    column.animate([{ opacity: 0, transform: `translateY(${CELL_RISE_PX}px)` }, { opacity: 1, transform: "none" }], { duration: TIMING.cell.duration, delay: delay + i * TIMING.cell.stagger, easing: SPRING, fill: "backwards" });
  });
}
