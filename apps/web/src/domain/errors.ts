/**
 * Everything the domain refuses, with a code controllers map to HTTP and a
 * message written for the person who caused it.
 */
export type DomainErrorCode =
  | "invalid_input"
  | "invalid_handle"
  | "handle_reserved"
  | "handle_taken"
  | "handle_already_set"
  | "invalid_wall"
  | "plan_limit"
  | "not_found"
  | "forbidden"
  | "unauthenticated"
  | "connection_failed"
  | "payments_unavailable";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DomainError";
  }

  /**
   * Next bundles each route separately, so a use case built in one bundle can
   * throw another bundle's copy of this class. Recognise it by shape instead
   * of identity, or domain errors turn into 500s in production.
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error && value.name === "DomainError" && typeof (value as { code?: unknown }).code === "string";
  }
}

export const notFound = (what: string) => new DomainError("not_found", `${what} doesn't exist.`);
export const forbidden = (message = "That isn't yours.") => new DomainError("forbidden", message);
export const invalid = (message: string) => new DomainError("invalid_input", message);
