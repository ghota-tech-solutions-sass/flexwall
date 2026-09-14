"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Children, type ReactNode, useEffect, useRef, useState } from "react";

/**
 * A horizontal gallery of large cards that snap into place, driven by a glass
 * pill of dots and arrow capsules. The track scrolls natively (swipe, trackpad,
 * keyboard); the controls only ask it to move.
 */
export function Highlights({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const cards = Children.toArray(children);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 }
    );
    root.querySelectorAll<HTMLElement>("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [cards.length]);

  const go = (index: number) => {
    const root = track.current;
    const card = root?.querySelector<HTMLElement>(`[data-index="${Math.max(0, Math.min(cards.length - 1, index))}"]`);
    if (!root || !card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ left: card.offsetLeft - root.offsetLeft - (root.clientWidth - card.clientWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="highlights">
      <div ref={track} className="highlights-track" role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0}>
        {cards.map((card, i) => (
          <div key={i} data-index={i} className={i === active ? "highlight is-active" : "highlight"} aria-roledescription="slide" aria-label={`${i + 1} of ${cards.length}`}>
            {card}
          </div>
        ))}
      </div>
      <div className="highlights-controls">
        <div className="dots glass" role="tablist" aria-label="Choose a highlight">
          {cards.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`Show highlight ${i + 1}`} className={i === active ? "on" : undefined} onClick={() => go(i)} />
          ))}
        </div>
        <button type="button" className="arrow glass" aria-label="Previous highlight" disabled={active === 0} onClick={() => go(active - 1)}>
          <CaretLeftIcon size={18} weight="bold" />
        </button>
        <button type="button" className="arrow glass" aria-label="Next highlight" disabled={active === cards.length - 1} onClick={() => go(active + 1)}>
          <CaretRightIcon size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
}
