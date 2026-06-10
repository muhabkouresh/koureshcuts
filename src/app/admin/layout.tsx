import type { Metadata } from "next";

// Admin pages advertise their own web-app manifest, so the dashboard can be
// installed as a separate home-screen app ("Kouresh Admin") that opens straight
// to /admin — independent of the customer-facing booking PWA.
export const metadata: Metadata = {
  title: "Admin",
  manifest: "/admin.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kouresh Admin",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
