import type { ServerStatus } from "@flexwall/sdk";

/**
 * Who may use a connector. Administrators choose it from the back office, but
 * the server's own credentials have the last word: a connector whose keys are
 * missing can't work, and one pointing at a provider's sandbox shows test data,
 * which never reaches owners — not even when an administrator asks.
 */

export const AVAILABILITIES = ["everyone", "admins", "off"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

/** What a connector nobody has touched gets. */
export const DEFAULT_AVAILABILITY: Availability = "everyone";

export function isAvailability(value: unknown): value is Availability {
  return AVAILABILITIES.includes(value as Availability);
}

/** An administrator's choice, and who made it. */
export interface ConnectorPolicy {
  availability: Availability;
  /** The administrator's email, for the record. */
  by: string;
  at: number;
}

/** Why a connector isn't simply what an administrator asked for. */
export type PolicyOverride = "unconfigured" | "sandbox" | null;

/** What stops a connector from being open to everyone, whatever an administrator chose. */
export function overrideOf(status: ServerStatus | null | undefined): PolicyOverride {
  if (!status) return null;
  if (!status.configured) return "unconfigured";
  return status.environment === "sandbox" ? "sandbox" : null;
}

/**
 * What applies: a connector without its keys is off, one on a provider's
 * sandbox is for administrators only, and otherwise the choice on record.
 */
export function effectiveAvailability(status: ServerStatus | null | undefined, chosen: Availability | undefined): Availability {
  const override = overrideOf(status);
  if (override === "unconfigured") return "off";
  const asked = chosen ?? DEFAULT_AVAILABILITY;
  if (override === "sandbox") return asked === "off" ? "off" : "admins";
  return asked;
}

export function visibleTo(availability: Availability, viewer: { administrator: boolean }): boolean {
  if (availability === "off") return false;
  return availability === "everyone" || viewer.administrator;
}
