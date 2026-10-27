import type { MetadataRoute } from "next";

// Crawlers must be able to read the noindex headers/meta tags to remove existing results.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
