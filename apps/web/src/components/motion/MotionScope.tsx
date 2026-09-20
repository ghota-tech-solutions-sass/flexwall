"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { installChartInteractions } from "./chart-interactions";
import { easeOutExpo, formatFigure, parseFigure } from "@/presentation/motion/figures";

const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Share of the scope that must be on screen before anything moves. */
const VISIBLE_THRESHOLD = 0.2;

/** Timing for explicitly marked figures and charts outside public wall tiles. */
const TIMING = {
  count: { start: 120, stagger: 90, duration: 1100 },
  draw: { start: 200, stagger: 90, duration: 1300 },
} as const;

/** Explicit marketing figures can count up; wall tiles animate only explicitly marked, non-private values. */
export function MotionScope({ children, className, tiles = false, motion = true, style }: { children: ReactNode; className?: string; tiles?: boolean; motion?: boolean; style?: React.CSSProperties }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (root.current && tiles) return installChartInteractions(root.current);
  }, [tiles]);

  useEffect(() => {
    const el = root.current;
    if (!motion || !el || typeof IntersectionObserver === "undefined") return;
    if (tiles) return observeTiles(el);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        animate(el);
      },
      { threshold: VISIBLE_THRESHOLD }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tiles, motion]);

  return (
    <div ref={root} className={className} style={style}>
      {children}
    </div>
  );
}

/** Per-tile observation keeps long walls lively without a giant off-screen animation queue.
 * Only explicitly marked figures count up; verification badges stay untouched.
 */
function observeTiles(root: HTMLElement) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const seen = new WeakSet<Element>();
  const enrolled = new WeakSet<Element>();
  const running = new Set<Animation>();
  const counters = new Set<() => void>();
  const play = (el: Element, frames: Keyframe[], delay: number, duration: number) => {
    const animation = el.animate(frames, { duration, delay, easing: SPRING, fill: "backwards" });
    running.add(animation);
    animation.onfinish = () => running.delete(animation);
  };
  const observer = new IntersectionObserver((entries) => {
    let order = 0;
    for (const entry of entries) {
      const tile = entry.target as HTMLElement;
      if (!entry.isIntersecting || tile.offsetParent === null || seen.has(tile)) continue;
      seen.add(tile);
      observer.unobserve(tile);
      if (preference.matches) continue;
      const delay = Math.min(order++, 4) * 45;
      play(tile, [{ opacity: 0.35, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }], delay, 520);
      tile.querySelectorAll<HTMLElement>("[data-figure]").forEach((figure) => {
        counters.add(countUp(figure, delay));
      });
      tile.querySelectorAll<HTMLElement>("[data-progress-fill]").forEach((bar) => {
        play(bar, [{ transform: "scaleX(0)", transformOrigin: "left center" }, { transform: "scaleX(1)", transformOrigin: "left center" }], delay + 80, 900);
      });
      tile.querySelectorAll<SVGCircleElement>("[data-progress-ring]").forEach((ring) => {
        const final = ring.getAttribute("stroke-dasharray")!;
        play(ring, [{ strokeDasharray: `0 ${2 * Math.PI * 40}` }, { strokeDasharray: final }], delay + 80, 900);
      });
      // Chart geometry has this viewBox; source shields and link icons do not.
      tile.querySelectorAll<SVGElement>('svg[viewBox="0 0 100 100"]').forEach((chart) => {
        if (chart.querySelector("circle")) {
          play(chart, [{ opacity: 0.4 }, { opacity: 1 }], delay + 80, 650);
        } else {
          play(chart, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], delay + 80, 750);
        }
      });
    }
  }, { threshold: 0.12 });
  const enroll = () => root.querySelectorAll<HTMLElement>(".wall-tile").forEach((tile) => {
    if (enrolled.has(tile)) return;
    enrolled.add(tile);
    observer.observe(tile);
  });
  const cancel = () => { running.forEach((animation) => animation.cancel()); running.clear(); counters.forEach((stop) => stop()); counters.clear(); };
  const onPreference = () => { if (preference.matches) cancel(); };
  enroll();
  const mutations = new MutationObserver(enroll);
  mutations.observe(root, { childList: true, subtree: true });
  preference.addEventListener("change", onPreference);
  return () => { observer.disconnect(); mutations.disconnect(); preference.removeEventListener("change", onPreference); cancel(); };
}

function animate(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el, i) => countUp(el, TIMING.count.start + i * TIMING.count.stagger));
  root.querySelectorAll<SVGElement>("[data-draw]").forEach((el, i) => draw(el, TIMING.draw.start + i * TIMING.draw.stagger));
}

/** Restore exact text on completion, unmount or reduced motion; never overwrite newer React data. */
function countUp(el: HTMLElement, delay: number): () => void {
  const node = el.firstChild;
  const final = el.textContent ?? "";
  const figure = parseFigure(final);
  if (!node || node.nodeType !== Node.TEXT_NODE || !figure || figure.value === 0) return () => {};
  let frame = 0;
  let written = final;
  let stopped = false;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    if (node.textContent === written) node.textContent = final;
  };
  const start = performance.now() + delay;
  const step = (now: number) => {
    if (stopped || !el.isConnected || node.textContent !== written) return;
    const t = Math.max(0, (now - start) / TIMING.count.duration);
    if (t >= 1) { stop(); return; }
    const value = figure.value * easeOutExpo(t);
    written = formatFigure(figure, figure.decimals ? value : Math.round(value));
    node.textContent = written;
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return stop;
}

/** Lines and areas reveal left to right, like a chart being drawn. */
function draw(el: SVGElement, delay: number) {
  el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: TIMING.draw.duration, delay, easing: SPRING, fill: "backwards" });
}
