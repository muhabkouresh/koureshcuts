"use client";

import { type ReactNode } from "react";

/**
 * Smooth-scrolls to an in-page element by id. Unlike a plain `<a href="#id">`
 * or Next's <Link>, this scrolls EVERY time it is clicked — even when the URL
 * hash already equals the target. (A same-hash link is a no-op in the browser,
 * which made the "Service auswählen" CTA appear unclickable after scrolling.)
 * Respects the target's `scroll-margin-top` (e.g. `scroll-mt-20`).
 */
export default function ScrollLink({
  targetId,
  children,
  className,
}: {
  targetId: string;
  children: ReactNode;
  className?: string;
}) {
  function handle(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = document.getElementById(targetId);
    if (!el) return; // let the browser fall back to the href
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${targetId}`);
  }

  return (
    <a href={`#${targetId}`} onClick={handle} className={className}>
      {children}
    </a>
  );
}
