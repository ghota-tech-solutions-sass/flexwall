import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DomainError, type DomainErrorCode } from "@/domain/errors";
import { container } from "@/composition";

/**
 * Glue between HTTP and use cases. Controllers stay a few lines: read the
 * request, call one use case, answer. Domain errors become statuses here and
 * nowhere else.
 */

export const SESSION_COOKIE = "fw_session";
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

const STATUS: Record<DomainErrorCode, number> = {
  invalid_input: 422,
  invalid_handle: 422,
  handle_reserved: 409,
  handle_taken: 409,
  handle_already_set: 409,
  invalid_wall: 422,
  plan_limit: 402,
  not_found: 404,
  forbidden: 403,
  unauthenticated: 401,
  connection_failed: 422,
  payments_unavailable: 503,
};

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: STATUS[error.code] });
  }
  console.error(error);
  return NextResponse.json({ error: "internal", message: "Something broke on our side. Try again in a moment." }, { status: 500 });
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
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
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
  if (!req.headers.get("content-type")?.includes("application/json")) throw new DomainError("invalid_input", "Send JSON.");
  const raw = await req.text();
  if (raw.length > 200_000) throw new DomainError("invalid_input", "That's too much data.");
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
