"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

/**
 * Sticky top bar. Transparent over the hero, then fades in a frosted
 * background once the user scrolls — a subtle premium cue.
 */
export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "border-b border-line/80 bg-page/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <Link href="#top" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={siteConfig.name}
            className="h-9 w-9 rounded-full object-cover ring-1 ring-line"
          />
          <span className="font-display text-lg font-bold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        <Link
          href="#book"
          className="btn-shine rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.03]"
        >
          Termin buchen
        </Link>
      </div>
    </header>
  );
}
