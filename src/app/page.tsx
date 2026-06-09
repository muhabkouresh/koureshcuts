import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import BookingFlow, { type Service } from "@/components/booking/BookingFlow";
import SiteHeader from "@/components/ui/SiteHeader";
import Reveal from "@/components/ui/Reveal";

export const dynamic = "force-dynamic";

const BENEFITS = [
  {
    title: "Sofortige Bestätigung",
    text: "Dein Termin ist sofort fix — die Bestätigung landet in Sekunden in deinem Postfach, inkl. Kalender-Eintrag.",
    icon: (
      <path d="M20 6 9 17l-5-5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "Buchung in unter 60 Sekunden",
    text: "Service wählen, freie Uhrzeit antippen, fertig. Kein Anruf, keine Wartezeit — rund um die Uhr buchbar.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" strokeWidth="2.2" />
        <path d="M12 7v5l3 2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Flexibel & zuverlässig",
    text: "Verschieben oder absagen mit einem Klick — und eine freundliche Erinnerung vor dem Termin gibt's gratis dazu.",
    icon: (
      <>
        <path d="M21 12a9 9 0 1 1-3-6.7" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M21 4v5h-5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
];

export default async function Home() {
  const serviceRows = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      durationMinutes: true,
      priceCents: true,
    },
  });
  const services: Service[] = serviceRows;

  return (
    <>
      <SiteHeader />

      {/* Hero */}
      <section
        id="top"
        className="hero-glow relative overflow-hidden border-b border-line bg-white"
      >
        {/* Floating logo backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-center select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="animate-float w-[150%] max-w-none -translate-y-[8%] opacity-[0.07] sm:w-full sm:max-w-5xl"
          />
        </div>

        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 pb-24 pt-36 text-center sm:pb-32 sm:pt-44">
          <span className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-background/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {siteConfig.name}
          </span>

          <h1 className="animate-fade-up delay-1 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Dein Look. Dein Termin.
            <br />
            <span className="text-brand">In einer Minute gebucht.</span>
          </h1>

          <p className="animate-fade-up delay-2 mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {siteConfig.tagline}
          </p>

          <div className="animate-fade-up delay-3 mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="#book"
              className="btn-shine rounded-full bg-brand px-9 py-4 text-base font-semibold text-white shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.03]"
            >
              Service auswählen
            </Link>
            <span className="text-sm text-muted">
              Sofortige Bestätigung · keine Wartezeit
            </span>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          aria-hidden
          className="relative flex justify-center pb-10 text-muted"
        >
          <svg
            className="animate-bounce-soft h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              d="m6 9 6 6 6-6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      {/* Why us — benefits */}
      <section className="border-b border-line bg-page py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Warum {siteConfig.name}
            </p>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Buchen, das sich premium anfühlt
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted">
              Keine Anrufe, keine Unsicherheit — nur ein paar Klicks bis zu
              deinem nächsten Schnitt.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <Reveal
                key={b.title}
                delay={((i + 1) as 1 | 2 | 3)}
                className="card-lift rounded-3xl border border-line bg-background p-7 shadow-soft"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    {b.icon}
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight">
                  {b.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {b.text}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Booking (services + flow) */}
      <main className="flex-1 bg-page">
        <section id="book" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-20 sm:py-24">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Termin buchen
            </p>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              In drei Schritten zum Termin
            </h2>
          </Reveal>

          {services.length === 0 ? (
            <p className="text-center text-sm text-muted">
              Aktuell sind keine Services verfügbar. Bitte später erneut versuchen.
            </p>
          ) : (
            <BookingFlow services={services} />
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-background">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <div className="flex flex-col items-center gap-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt={siteConfig.name}
              className="h-14 w-14 rounded-full object-cover ring-1 ring-line"
            />
            <p className="font-display text-xl font-bold tracking-tight">
              {siteConfig.name}
            </p>

            {siteConfig.socials.instagram && (
              <a
                href={siteConfig.socials.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-page px-5 py-2 text-sm font-medium transition-colors hover:border-foreground"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <rect x="3" y="3" width="18" height="18" rx="5" strokeWidth="2" />
                  <circle cx="12" cy="12" r="4" strokeWidth="2" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
                Instagram
              </a>
            )}
          </div>

          <div className="divider-fade my-10" />

          <div className="flex flex-col items-center gap-2 text-center text-xs text-muted">
            <Link
              href="/datenschutz"
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Datenschutzerklärung
            </Link>
            <span>
              © {new Date().getFullYear()} {siteConfig.name}. Alle Rechte
              vorbehalten.
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
