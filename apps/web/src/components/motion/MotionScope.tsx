"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { easeOutExpo, formatFigure, parseFigure } from "@/presentation/motion/figures";

const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";

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
      { threshold: 0.2 }
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
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el, i) => countUp(el, 120 + i * 90));
  root.querySelectorAll<SVGElement>("[data-draw]").forEach((el, i) => draw(el, 200 + i * 90));
  if (!tiles) return;
  root.querySelectorAll<HTMLElement>(".wall-tile").forEach((tile, i) => {
    if (tile.offsetParent === null) return; // the other breakpoint's copy
    const delay = 80 + i * 70;
    leafFigures(tile).forEach((el) => countUp(el, delay));
    tile.querySelectorAll<SVGElement>("svg").forEach((svg) => draw(svg, delay + 120));
    bars(tile).forEach((bar) => fill(bar, delay + 160));
    heatmaps(tile).forEach((cells) => lightUp(cells, delay + 100));
  });
}

/** Leaf elements whose text is one big figure: labels and small print are left alone. */
function leafFigures(tile: HTMLElement): HTMLElement[] {
  return [...tile.querySelectorAll<HTMLElement>("div, span, b")].filter((el) => {
    if (el.childElementCount > 0 || !parseFigure(el.textContent ?? "")) return false;
    return Number.parseFloat(getComputedStyle(el).fontSize) >= 18;
  });
}

function countUp(el: HTMLElement, delay: number) {
  const final = el.textContent ?? "";
  const figure = parseFigure(final);
  if (!figure || figure.value === 0) return;
  const duration = 1100;
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
  el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 1300, delay, easing: SPRING, fill: "backwards" });
}

/** Bars are a filled child inside a clipped track: grow the fill from the left. */
function bars(tile: HTMLElement): HTMLElement[] {
  return [...tile.querySelectorAll<HTMLElement>("div")].filter((el) => el.style.width.endsWith("%") && el.parentElement?.style.overflow === "hidden");
}

function fill(el: HTMLElement, delay: number) {
  el.style.transformOrigin = "left center";
  el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 1200, delay, easing: SPRING, fill: "backwards" });
}

/** A heatmap is a row of columns of many equal cells: light them column by column. */
function heatmaps(tile: HTMLElement): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  tile.querySelectorAll<HTMLElement>("div").forEach((el) => {
    const columns = [...el.children] as HTMLElement[];
    if (columns.length < 20 || !columns.every((c) => c.childElementCount >= 5)) return;
    groups.push(columns);
  });
  return groups;
}

function lightUp(columns: HTMLElement[], delay: number) {
  columns.forEach((column, i) => {
    column.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: delay + i * 12, easing: SPRING, fill: "backwards" });
  });
}
