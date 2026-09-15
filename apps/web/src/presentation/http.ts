import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_PENDING_TTL_MS } from "@/domain/connection";
import { DomainError, type DomainErrorCode } from "@/domain/errors";
import { container } from "@/composition";
import { isProduction } from "@/infrastructure/env";
import { HTTP_STATUS, JSON_CONTENT_TYPE } from "./json";
import { API, ROUTES } from "./routes";

/**
 * Glue between HTTP and use cases. Controllers stay a few lines: read the
 * request, call one use case, answer. Domain errors become statuses here and
 * nowhere else.
 */

export const SESSION_COOKIE = "fw_session";
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
/** Largest JSON body a controller reads, in characters. A full wall draft is far below it. */
const MAX_JSON_BODY_CHARS = 200_000;
/** The error code of anything that isn't a domain error. */
const INTERNAL_ERROR = "internal";

const STATUS: Record<DomainErrorCode, number> = {
  invalid_input: HTTP_STATUS.unprocessable,
  invalid_handle: HTTP_STATUS.unprocessable,
  handle_reserved: HTTP_STATUS.conflict,
  handle_taken: HTTP_STATUS.conflict,
  handle_already_set: HTTP_STATUS.conflict,
  invalid_wall: HTTP_STATUS.unprocessable,
  plan_limit: HTTP_STATUS.paymentRequired,
  not_found: HTTP_STATUS.notFound,
  forbidden: HTTP_STATUS.forbidden,
  unauthenticated: HTTP_STATUS.unauthorized,
  connection_failed: HTTP_STATUS.unprocessable,
  payments_unavailable: HTTP_STATUS.unavailable,
};

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: STATUS[error.code] });
  }
  console.error(error);
  return NextResponse.json({ error: INTERNAL_ERROR, message: "Something broke on our side. Try again in a moment." }, { status: HTTP_STATUS.internal });
}

/** The signed-in user's id, or null. */
export async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return container().tokens.verifySession(token);
}

export async function requireUserId(): Promise<string> {
  const id = await sessionUserId();
  if (!id) throw new DomainError("unauthenticated", "Sign in to do that.");
  return id;
}

export function setSession(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: ROUTES.home,
    maxAge: SESSION_MAX_AGE_S,
  });
}

/** A sign-in at a provider in progress: sealed, readable only by the callback, gone once it can't finish anymore. */
export const PENDING_SIGN_IN_COOKIE = "fw_oauth";
const PENDING_SIGN_IN_MAX_AGE_S = OAUTH_PENDING_TTL_MS / 1000;

export function setPendingSignIn(response: NextResponse, sealed: string) {
  response.cookies.set(PENDING_SIGN_IN_COOKIE, sealed, {
    httpOnly: true,
    secure: isProduction(),
    // Lax: the provider sends the owner back with a top-level GET, which carries it.
    sameSite: "lax",
    path: API.oauthCallback,
    maxAge: PENDING_SIGN_IN_MAX_AGE_S,
  });
}

export function clearPendingSignIn(response: NextResponse) {
  response.cookies.set(PENDING_SIGN_IN_COOKIE, "", { httpOnly: true, secure: isProduction(), sameSite: "lax", path: API.oauthCallback, maxAge: 0 });
}

/**
 * Mutations accept JSON only, from our own origin. With a SameSite=Lax cookie,
 * that closes cross-site request forgery: a foreign form can't send JSON, and
 * a foreign script can't read or pass the origin check.
 */
export async function readJson<T>(req: Request): Promise<T> {
  const origin = req.headers.get("origin");
  const appUrl = container().appUrl;
  if (origin && origin !== appUrl && origin !== new URL(req.url).origin) {
    throw new DomainError("forbidden", "Cross-site requests aren't allowed.");
  }
  if (!req.headers.get("content-type")?.includes(JSON_CONTENT_TYPE)) throw new DomainError("invalid_input", "Send JSON.");
  const raw = await req.text();
  if (raw.length > MAX_JSON_BODY_CHARS) throw new DomainError("invalid_input", "That's too much data.");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new DomainError("invalid_input", "That isn't valid JSON.");
  }
}

/** Runs a controller body and turns whatever it throws into a response. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return errorResponse(error);
  }
}
