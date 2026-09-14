import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Workspace packages (SDK, plugins) live outside this app: trace from the repo root.
  outputFileTracingRoot: root,
  turbopack: { root },
  // Image renderers read the fonts from disk at runtime.
  outputFileTracingIncludes: { "/**": ["./public/fonts/**/*"] },
  images: {
    formats: ["image/avif", "image/webp"],
    // Only the landing page's photographs and demo renders go through the optimizer; walls stay PNG for wallpapers.
    localPatterns: [
      { pathname: "/_next/static/media/**", search: "" },
      { pathname: "/demo/**", search: "" },
    ],
    qualities: [75],
    minimumCacheTTL: 86400,
  },
  async redirects() {
    // One address per page for search engines: www goes to the apex, path and query kept.
    return [{ source: "/:path*", has: [{ type: "host", value: "www.flexwall.lol" }], destination: "https://flexwall.lol/:path*", permanent: true }];
  },
  async rewrites() {
    // Walls live at /@handle; the route folder is /u/[handle] because "@" starts a parallel route in the app router.
    return [{ source: "/@:handle", destination: "/u/:handle" }];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: [...securityHeaders, { key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
