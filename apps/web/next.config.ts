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
