"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isStandalone } from "@/lib/pushClient";

/**
 * Footer entry to /app. Inside the installed app "App installieren" reads as
 * nonsense — there it points at what the page actually offers to someone who
 * already has it: switching notifications on.
 */
export default function AppFooterLink({
  className,
}: {
  className?: string;
}) {
  const [installed, setInstalled] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- client-only display-mode check */
  useEffect(() => {
    if (isStandalone()) setInstalled(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Link href="/app" className={className}>
      {installed ? "Benachrichtigungen" : "App installieren"}
    </Link>
  );
}
