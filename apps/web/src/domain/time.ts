/**
 * Today's date (YYYY-MM-DD) in a time zone. Falls back to UTC for unknown zones.
 * Built from date parts, never from a locale's own format: runtimes with trimmed
 * locale data (Node on Alpine) print en-CA dates the US way.
 */
export function todayIn(timeZone: string, now: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
