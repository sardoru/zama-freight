import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The demo never asks for the camera or the microphone; "locate me" on the map may ask for geolocation.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The share cards read their fonts from disk at render time.
  outputFileTracingIncludes: { "/[lang]/opengraph-image": ["./assets/fonts/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The MapLibre worker is copied under its package version (scripts/copy-worker.mjs): a new
      // version is a new URL, so the 150 KB file can be cached for good.
      {
        source: "/vendor/:file(maplibre-gl-worker-[^/]+\\.mjs)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
