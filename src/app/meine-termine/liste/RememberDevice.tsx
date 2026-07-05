"use client";

import { useEffect } from "react";

// Persist the magic-link credentials on this device so "Meine Termine" opens
// directly next time — an account-like experience without a password.
export default function RememberDevice({ e, t }: { e: string; t: string }) {
  useEffect(() => {
    try {
      localStorage.setItem("kc_myappts", JSON.stringify({ e, t }));
    } catch {
      // Storage unavailable (private mode) — the emailed link still works.
    }
  }, [e, t]);
  return null;
}
