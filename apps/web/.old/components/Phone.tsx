"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A lock screen around a wallpaper: the real clock over the rendered image,
 * so people judge the layout where it will actually live.
 */
export function Phone({ src, alt, tone = "light" }: { src: string; alt: string; tone?: "light" | "dark" }) {
  const [now, setNow] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  // An image that finished before hydration never fires onLoad for React.
  useEffect(() => setLoading(!img.current?.complete), [src]);

  const date = now?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) ?? "";
  const time = now?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false }) ?? "";

  return (
    <div className="phone">
      <div className="phone-screen">
        <img ref={img} src={src} alt={alt} data-loading={loading} onLoad={() => setLoading(false)} onError={() => setLoading(false)} />
        <div className="lock" data-tone={tone} aria-hidden="true">
          <div className="lock-date">{date}</div>
          <div className="lock-time">{time}</div>
          <div className="lock-btn left" />
          <div className="lock-btn right" />
          <div className="lock-bar" />
        </div>
        <div className="phone-island" aria-hidden="true" />
      </div>
    </div>
  );
}
