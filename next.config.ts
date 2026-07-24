import type { NextConfig } from "next";

// Baseline security headers applied to every response. HSTS forces HTTPS,
// nosniff blocks MIME-confusion, DENY stops the site being framed
// (clickjacking), and the Permissions-Policy switches off device APIs the
// site never uses. (A strict Content-Security-Policy is a good next step but
// needs testing against Next.js's inline runtime, so it's left out for now.)
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
