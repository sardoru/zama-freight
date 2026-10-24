// The public origin, for absolute URLs in metadata (OG images, hreflang, sitemap).
// On Vercel the production domain is known at build time.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
