import { NextResponse } from "next/server";
import { container } from "@/composition";
import { SESSION_COOKIE } from "@/presentation/http";
import { HTTP_STATUS } from "@/presentation/json";

export async function POST() {
  const response = NextResponse.redirect(container().appUrl, HTTP_STATUS.seeOther);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
