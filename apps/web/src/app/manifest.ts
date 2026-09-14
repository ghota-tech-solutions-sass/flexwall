import type { MetadataRoute } from "next";
import { ROUTES } from "@/presentation/routes";
import { size as appleIconSize } from "./apple-icon";
import { SITE_DESCRIPTION, SITE_NAME } from "@/presentation/seo/structured-data";

/** Splash and title bar color of the installed app. */
const APP_BACKGROUND = "#0d0f1f";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: ROUTES.home,
    display: "standalone",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      { src: ROUTES.icon, type: "image/svg+xml", sizes: "any" },
      { src: ROUTES.appleIcon, type: "image/png", sizes: `${appleIconSize.width}x${appleIconSize.height}` },
    ],
  };
}
