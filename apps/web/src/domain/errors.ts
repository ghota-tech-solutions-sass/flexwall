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
}

export const notFound = (what: string) => new DomainError("not_found", `${what} doesn't exist.`);
export const forbidden = (message = "That isn't yours.") => new DomainError("forbidden", message);
export const invalid = (message: string) => new DomainError("invalid_input", message);
