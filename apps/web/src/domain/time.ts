/** The language dates and numbers are printed in. The site is written in English. */
export const APP_LOCALE = "en-US";

/** The zone for dates that aren't tied to a person: sample data, join dates, "updated" stamps. */
export const DISPLAY_TIME_ZONE = "UTC";

export const MINUTE_MS = 60_000;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;

/** Suffix that turns a YYYY-MM-DD day into its first instant, in UTC. */
const MIDNIGHT_UTC = "T00:00:00Z";

/** Characters in a YYYY-MM-DD day, the start of an ISO timestamp. */
const ISO_DAY_LENGTH = 10;

/** A moment as its UTC day, YYYY-MM-DD. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, ISO_DAY_LENGTH);
}

/** The first instant of a YYYY-MM-DD day, in UTC. */
export function startOfDay(day: string): Date {
  return new Date(day + MIDNIGHT_UTC);
}

/**
 * Today's date (YYYY-MM-DD) in a time zone. Falls back to UTC for unknown zones.
 * Built from date parts, never from a locale's own format: runtimes with trimmed
 * locale data (Node on Alpine) print en-CA dates the US way.
 */
export function todayIn(timeZone: string, now: number): string {
  try {
    const parts = new Intl.DateTimeFormat(APP_LOCALE, { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return isoDay(new Date(now));
  }
}

export function shiftDay(day: string, delta: number): string {
  const d = startOfDay(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDay(d);
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(APP_LOCALE, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
