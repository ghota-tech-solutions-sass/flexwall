/** Page-only enhancement: chart renderers expose already privacy-filtered labels. */
export function installChartInteractions(root: HTMLElement) {
  const tip = document.createElement("div");
  tip.className = "chart-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);
  let active: Element | null = null;
  const point = (target: EventTarget | null) => target instanceof Element && root.contains(target) ? target.closest<HTMLElement | SVGElement>("[data-chart-point]") : null;
  const hide = () => { active?.removeAttribute("data-chart-active"); active = null; tip.hidden = true; };
  const show = (target: Element) => {
    hide();
    active = target;
    target.setAttribute("data-chart-active", "true");
    tip.textContent = target.getAttribute("data-chart-point");
    tip.hidden = false;
    const box = target.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left + box.width / 2 - width / 2))}px`;
    tip.style.top = `${box.top > height + 16 ? box.top - height - 8 : Math.min(innerHeight - height - 8, box.bottom + 8)}px`;
  };
  const enter = (event: Event) => { const target = point(event.target); if (target) show(target); };
  const leave = (event: Event) => {
    if (event instanceof PointerEvent && event.pointerType !== "mouse") return;
    if (point(event.target) !== active) return;
    if (event instanceof PointerEvent && document.activeElement === active) return;
    hide();
  };
  const tap = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    const target = point(event.target);
    if (target) { target.focus({ preventScroll: true }); show(target); }
    else hide();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") { hide(); return; }
    const target = point(event.target);
    if (!target || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const points = [...(target.closest(".wall-tile")?.querySelectorAll<HTMLElement | SVGElement>("[data-chart-point]") ?? [])];
    const index = points.indexOf(target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1)));
    event.preventDefault();
    target.setAttribute("tabindex", "-1");
    points[next]?.setAttribute("tabindex", "0");
    points[next]?.focus({ preventScroll: true });
  };
  const reposition = () => {
    if (active && document.activeElement === active) show(active);
    else hide();
  };
  root.addEventListener("pointerover", enter);
  root.addEventListener("pointerout", leave);
  root.addEventListener("focusin", enter);
  root.addEventListener("focusout", leave);
  root.addEventListener("keydown", key);
  document.addEventListener("pointerdown", tap);
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  return () => {
    hide(); tip.remove();
    root.removeEventListener("pointerover", enter); root.removeEventListener("pointerout", leave);
    root.removeEventListener("focusin", enter); root.removeEventListener("focusout", leave);
    root.removeEventListener("keydown", key); document.removeEventListener("pointerdown", tap);
    window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition);
  };
}
