import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

// Web App Manifest — makes the site installable ("Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — Termin buchen`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f3f2",
    theme_color: "#8a1f2b",
    lang: "de",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
