/** Limits on what a visitor sends when reporting a wall. */

export const REPORT_REASON_MIN = 5;
export const REPORT_REASON_MAX = 1000;
/** A way to reach the reporter. Longer input is cut, not refused: the report still matters. */
export const REPORT_CONTACT_MAX = 200;

/** The contact as moderation receives it: cut to the cap, or absent. */
export function reportContact(contact: string | undefined): string | undefined {
  return contact ? contact.slice(0, REPORT_CONTACT_MAX) : undefined;
}
