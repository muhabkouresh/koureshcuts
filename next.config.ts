import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Flip to false to ENFORCE the CSP; true sends it report-only (browsers log
// violations to the console but don't block), so it can be validated live
// first. Every resource the site loads is same-origin (fonts self-hosted via
// next/font, Vercel Analytics proxied under our own domain, all APIs local),
// so 'self' is enough — 'unsafe-inline' only covers Next.js's inline
// hydration bootstrap and inline style attributes, which keeps the pages
// statically cacheable (a per-request nonce would not).
const CSP_REPORT_ONLY = false;

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

// Baseline security headers applied to every response. HSTS forces HTTPS,
// nosniff blocks MIME-confusion, DENY stops the site being framed
// (clickjacking), the Permissions-Policy switches off unused device APIs, and
// the CSP restricts every resource to same-origin.
const securityHeaders = [
  // Keep direct links and the installed app usable while opting out of search indexing.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: CSP_REPORT_ONLY
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: csp,
  },
];

// Files in /public are served with `max-age=0, must-revalidate` by default, so
// the logo and app icons cost a round trip on every single page load. They are
// brand assets that change once a year at most; an hour of caching plus a day
// of stale-while-revalidate removes that trip without making an update wait.
const staticAssetCache = [
  {
    key: "Cache-Control",
    value: "public, max-age=3600, stale-while-revalidate=86400",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/:file(logo.png|apple-icon.png|icon-192.png|icon-512.png|favicon.ico)",
        headers: staticAssetCache,
      },
    ];
  },
};

export default nextConfig;
