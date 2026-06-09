"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Wraps content that should fade + slide into view when scrolled near.
 * Uses IntersectionObserver — no external dependencies. Falls back to
 * visible immediately if IO is unavailable or motion is reduced.
 */
export default function Reveal({
  children,
  className = "",
  delay,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Optional stagger: 1–4 maps to small incremental delays. */
  delay?: 1 | 2 | 3 | 4;
  as?: "div" | "section" | "li" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Fallback for environments without IntersectionObserver: reveal at once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const delayClass = delay ? ` delay-${delay}` : "";

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`reveal${delayClass}${visible ? " is-visible" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}
