import Link from "next/link";
import { siteConfig } from "@/config/site";
import AppInstall from "@/components/ui/AppInstall";

const title = `${siteConfig.name} als App aufs Handy`;
const description =
  "In Sekunden buchen, Erinnerung aufs Handy und als Erster erfahren, wenn ein Termin frei wird.";

export const metadata = {
  title,
  description,
  // This page is shared from Instagram stories and WhatsApp — make sure the
  // link preview shows the shop, not a bare URL.
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: siteConfig.name,
    title,
    description,
    images: [{ url: "/logo.png", width: 512, height: 512, alt: siteConfig.name }],
  },
  twitter: { card: "summary", title, description, images: ["/logo.png"] },
};

// Ordered by what actually motivates installing, most persuasive first: the
// shop runs at ~80% capacity, so "hear about free slots first" beats speed.
const BENEFITS = [
  {
    icon: "⚡",
    title: "Als Erster bei freien Terminen",
    text: "Sagt jemand ab, bekommst du es sofort aufs Handy — statt es zu verpassen.",
  },
  {
    icon: "🔔",
    title: "Erinnerung vor dem Termin",
    text: "Eine freundliche Erinnerung, damit du ihn garantiert nicht vergisst.",
  },
  {
    icon: "📅",
    title: "Buchen in 10 Sekunden",
    text: "Ein Tipp aufs Symbol — kein Suchen, kein Link. Termine verschieben inklusive.",
  },
];

// Shareable install page ("koureshcuts.de/app"): the link for the Instagram
// bio and stories. The device-aware step-by-step guide and the push opt-in
// live in the AppInstall client component.
export default function AppPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-14 pt-8">
      <div className="text-center">
        <Link href="/" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={siteConfig.name}
            className="mx-auto h-20 w-20 rounded-3xl object-cover shadow-soft ring-1 ring-line"
          />
        </Link>
        <h1 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight">
          {siteConfig.name}
          <br />
          als App aufs Handy
        </h1>
        <p className="mt-3 text-muted">
          Dauert 20 Sekunden — danach buchst du mit einem Tipp und verpasst
          keinen freien Termin mehr.
        </p>
      </div>

      <div className="mt-8">
        <AppInstall />
      </div>

      <div className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          Warum als App?
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="flex items-start gap-3 rounded-2xl border border-line bg-background p-4 shadow-soft"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {b.icon}
              </span>
              <div>
                <p className="font-semibold">{b.title}</p>
                <p className="mt-0.5 text-sm text-muted">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Escape hatch: plenty of story visitors just want a haircut now. */}
      <div className="mt-10 rounded-2xl bg-surface p-5 text-center">
        <p className="text-sm font-medium">Lieber gleich einen Termin?</p>
        <Link
          href="/#book"
          className="btn-shine mt-3 inline-block rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-brand)]"
        >
          Termin buchen
        </Link>
        <p className="mt-3 text-xs text-muted">
          Schon Kunde?{" "}
          <Link
            href="/meine-termine"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Meine Termine
          </Link>
        </p>
      </div>
    </main>
  );
}
