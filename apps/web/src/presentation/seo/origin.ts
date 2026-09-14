import { LOCAL_APP_URL } from "@/site";

/** The public origin pages describe themselves with, from build or runtime configuration. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || LOCAL_APP_URL).replace(/\/+$/, "");
}
