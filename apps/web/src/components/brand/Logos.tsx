import { siGoogleanalytics, siBluesky, siGithub, siLemonsqueezy, siNpm, siPlausibleanalytics, siPypi, siStripe, siYcombinator, siYoutube } from "simple-icons";

/** Brand marks from Simple Icons, by connector id. Connectors without a mark get none. */
const MARKS: Record<string, { title: string; path: string }> = {
  stripe: siStripe,
  github: siGithub,
  npm: siNpm,
  pypi: siPypi,
  bluesky: siBluesky,
  hackernews: siYcombinator,
  "lemon-squeezy": siLemonsqueezy,
  plausible: siPlausibleanalytics,
  "google-analytics": siGoogleanalytics,
  youtube: siYoutube,
};

export function hasMark(connectorId: string): boolean {
  return connectorId in MARKS;
}

export function BrandMark({ id, size = 24 }: { id: string; size?: number }) {
  const mark = MARKS[id];
  if (!mark) return null;
  return (
    <svg role="img" aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d={mark.path} />
    </svg>
  );
}
