"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import ScrollLink from "@/components/ui/ScrollLink";

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
        <ScrollLink targetId="top" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={siteConfig.name}
            className="h-9 w-9 rounded-full object-cover ring-1 ring-line"
          />
          <span className="font-display text-lg font-bold tracking-tight">
            {siteConfig.name}
          </span>
        </ScrollLink>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href="/meine-termine"
            aria-label="Meine Termine"
            title="Meine Termine"
            className="flex items-center justify-center rounded-full border border-brand/40 bg-brand-soft p-2 text-sm font-semibold text-brand transition-colors hover:bg-brand hover:text-white sm:px-4 sm:py-2"
          >
            {/* Compact calendar icon on phones — the text label would collide
                with the shop name on narrow screens. */}
            <svg
              className="h-5 w-5 sm:hidden"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="17" rx="3" strokeWidth="2" />
              <path
                d="M3 9h18M8 2v4M16 2v4M9 15l2 2 4-4"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hidden sm:inline">Meine Termine</span>
          </Link>
          <ScrollLink
            targetId="book"
            className="btn-shine rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.03]"
          >
            Termin buchen
          </ScrollLink>
        </div>
      </div>
    </header>
  );
}
