import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { getNextFreeSlot } from "@/lib/availability";
import { formatDateTimeLabel, nowMs } from "@/lib/time";
import BookingFlow, { type Service } from "@/components/booking/BookingFlow";
import SiteHeader from "@/components/ui/SiteHeader";
import Reveal from "@/components/ui/Reveal";
import ScrollLink from "@/components/ui/ScrollLink";
import InstallPrompt from "@/components/ui/InstallPrompt";

// Serve the landing shell from cache and refresh it in the background every
// 60s (ISR) instead of hitting Neon on every visit (force-dynamic). Services
// change rarely; live availability is fetched client-side (no-store) anyway,
// so this only speeds up the first paint without staleness where it matters.
export const revalidate = 60;

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

// "5. Juli", "5.–6. Juli" or "28. Juli – 2. August" for a closed range.
// `end` is stored exclusive (next midnight), so the last shown day is end-1.
function closureLabel(start: Date, end: Date): string {
  const tz = siteConfig.timezone;
  const last = new Date(end.getTime() - 1);
  const from = formatInTimeZone(start, tz, "d. MMMM", { locale: de });
  const to = formatInTimeZone(last, tz, "d. MMMM", { locale: de });
  if (from === to) return from;
  const sameMonth =
    formatInTimeZone(start, tz, "yyyy-MM") ===
    formatInTimeZone(last, tz, "yyyy-MM");
  if (sameMonth) {
    return `${formatInTimeZone(start, tz, "d.", { locale: de })}–${to}`;
  }
  return `${from} – ${to}`;
}

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

  // Upcoming closures (next 30 days) for the info banner, and the earliest
  // bookable slot as a hero teaser. Both refresh with the 60s ISR cycle.
  const closures = await prisma.timeOff.findMany({
    where: {
      endDate: { gt: new Date(nowMs()) },
      startDate: { lt: new Date(nowMs() + 30 * 24 * 60 * 60_000) },
    },
    orderBy: { startDate: "asc" },
    take: 3,
    select: { id: true, startDate: true, endDate: true },
  });
  let nextSlot: string | null = null;
  if (services[0]) {
    try {
      nextSlot = (await getNextFreeSlot(services[0].id))?.start ?? null;
    } catch (err) {
      console.error("next free slot failed", err);
    }
  }

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
          {closures.length > 0 && (
            <div className="animate-fade-up mb-6 w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-3 text-sm text-amber-800 backdrop-blur-sm">
              <p className="font-semibold">
                {closures.length === 1 ? "Geschlossen" : "Geschlossen an folgenden Tagen"}
              </p>
              <p className="mt-0.5">
                {closures
                  .map((c) => closureLabel(c.startDate, c.endDate))
                  .join(" · ")}
              </p>
            </div>
          )}

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
            <ScrollLink
              targetId="book"
              className="btn-shine rounded-full bg-brand px-9 py-4 text-base font-semibold text-white shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.03]"
            >
              Service auswählen
            </ScrollLink>
            <span className="text-sm text-muted">
              Sofortige Bestätigung · keine Wartezeit
            </span>
          </div>

          {nextSlot && (
            <p className="animate-fade-up delay-3 mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/90 px-4 py-2 text-sm font-medium text-emerald-800 backdrop-blur-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Nächster freier Termin:{" "}
              <strong>
                {formatDateTimeLabel(new Date(nextSlot), siteConfig.timezone)}
              </strong>
            </p>
          )}
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

      <InstallPrompt />

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
            <div className="flex items-center gap-4">
              <Link
                href="/meine-termine"
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Meine Termine
              </Link>
              <Link
                href="/datenschutz"
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Datenschutzerklärung
              </Link>
            </div>
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
