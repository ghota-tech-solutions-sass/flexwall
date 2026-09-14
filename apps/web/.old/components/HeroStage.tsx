"use client";

import { useEffect, useState } from "react";
import { THEMES, type ThemeId } from "@/lib/config";
import { SAMPLE_ORDER, samplePreviewUrl } from "@/lib/samples";
import { Phone } from "@/components/Phone";

export function HeroStage() {
  const [theme, setTheme] = useState<ThemeId>("ink");

  // Warm the other samples once the first one is up, so switching feels instant.
  useEffect(() => {
    const t = setTimeout(() => SAMPLE_ORDER.forEach((s) => (new Image().src = samplePreviewUrl(s))), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="hero-stage">
      <Phone src={samplePreviewUrl(theme)} alt={`A ${THEMES[theme].label} wallpaper with sample numbers`} tone={THEMES[theme].tone} />
      <div className="theme-switch" role="group" aria-label="Try a theme">
        {SAMPLE_ORDER.map((t) => (
          <button key={t} type="button" aria-pressed={t === theme} onClick={() => setTheme(t)}>
            {THEMES[t].label}
          </button>
        ))}
      </div>
    </div>
  );
}
