import { NextResponse } from "next/server";
import { container } from "@/composition";
import { SESSION_COOKIE } from "@/presentation/http";

export async function POST() {
  const response = NextResponse.redirect(container().appUrl, 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
