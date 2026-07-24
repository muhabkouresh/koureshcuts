import Link from "next/link";
import { siteConfig } from "@/config/site";
import AppInstall from "@/components/ui/AppInstall";

export const metadata = {
  title: `App installieren — ${siteConfig.name}`,
  description: `Hol dir ${siteConfig.name} als App aufs Handy: in Sekunden buchen, Termin-Erinnerungen als Push und deine Termine immer griffbereit.`,
};

const BENEFITS = [
  {
    icon: "⚡",
    title: "In Sekunden buchen",
    text: "Ein Tipp aufs Symbol — kein Suchen, kein Link. Direkt zum Termin.",
  },
  {
    icon: "🔔",
    title: "Erinnerung als Push",
    text: "Eine freundliche Erinnerung vor dem Termin, direkt aufs Handy.",
  },
  {
    icon: "📅",
    title: "Termine immer dabei",
    text: "Deine Termine ansehen, verschieben oder absagen — jederzeit.",
  },
];

// Shareable install page ("koureshcuts.de/app"): perfect for the Instagram bio
// and stories. Device-aware step-by-step guide lives in the client component.
export default function AppPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-12">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt={siteConfig.name}
          className="mx-auto h-20 w-20 rounded-3xl object-cover shadow-soft ring-1 ring-line"
        />
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight">
          {siteConfig.name} als App
        </h1>
        <p className="mt-2 text-muted">
          Installiere die Seite mit einem Tipp als App auf deinem
          Home-Bildschirm — schneller buchen, Erinnerungen als Push.
        </p>
      </div>

      <div className="mt-8">
        <AppInstall />
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-brand">
          Warum als App?
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="flex items-start gap-3 rounded-2xl border border-line bg-background p-4 shadow-soft"
            >
              <span className="text-2xl">{b.icon}</span>
              <div>
                <p className="font-semibold">{b.title}</p>
                <p className="mt-0.5 text-sm text-muted">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <Link
          href="/#book"
          className="btn-shine rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-brand)]"
        >
          Lieber gleich einen Termin buchen
        </Link>
        <Link
          href="/"
          className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Zur Startseite
        </Link>
      </div>
    </main>
  );
}
