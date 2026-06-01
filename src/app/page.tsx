import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { minutesToTimeLabel } from "@/lib/time";
import BookingFlow, { type Service } from "@/components/booking/BookingFlow";

export const dynamic = "force-dynamic";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
// Display order: Monday-first, Sunday last.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function money(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export default async function Home() {
  const [serviceRows, hours] = await Promise.all([
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        priceCents: true,
      },
    }),
    prisma.businessHours.findMany(),
  ]);

  const services: Service[] = serviceRows;
  const openWeekdays = hours.filter((h) => !h.isClosed).map((h) => h.dayOfWeek);
  const hoursByDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-line/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-lg font-semibold tracking-tight">
            {siteConfig.name}
          </span>
          <Link
            href="#book"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Book now
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-5 pt-20 pb-16 text-center sm:pt-28">
          <p className="text-sm font-medium uppercase tracking-widest text-muted">
            Barbershop · Book online
          </p>
          <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            {siteConfig.tagline}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-muted">
            {siteConfig.description}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="#book"
              className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
            >
              Book an appointment
            </Link>
            <Link
              href="#services"
              className="rounded-full border border-line px-6 py-3 text-sm font-medium hover:border-foreground"
            >
              View services
            </Link>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Services
          </h2>
          <ul className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between rounded-2xl border border-line bg-surface p-5"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="mt-1 text-sm text-muted">{s.description}</p>
                  <p className="mt-2 text-xs text-muted">{s.durationMinutes} min</p>
                </div>
                <span className="ml-4 shrink-0 text-lg font-semibold">
                  {money(s.priceCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Booking */}
        <section id="book" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Book your appointment
          </h2>
          <p className="mt-2 text-center text-sm text-muted">
            Pick a service, choose a time, done in under a minute.
          </p>
          <div className="mt-10">
            {services.length === 0 ? (
              <p className="text-center text-sm text-muted">
                No services available yet. Please check back soon.
              </p>
            ) : (
              <BookingFlow services={services} openWeekdays={openWeekdays} />
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:grid-cols-3">
          <div>
            <p className="text-lg font-semibold tracking-tight">
              {siteConfig.name}
            </p>
            <p className="mt-2 max-w-xs text-sm text-muted">
              {siteConfig.description}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Hours</h3>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {DISPLAY_ORDER.map((dow) => {
                const h = hoursByDay.get(dow);
                const label =
                  !h || h.isClosed
                    ? "Closed"
                    : `${minutesToTimeLabel(h.openMinute)} – ${minutesToTimeLabel(
                        h.closeMinute,
                      )}`;
                return (
                  <li key={dow} className="flex justify-between gap-6">
                    <span>{WEEKDAY_NAMES[dow]}</span>
                    <span className="tabular-nums">{label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Visit & contact</h3>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>{siteConfig.address}</li>
              <li>
                <a className="hover:text-foreground" href={`tel:${siteConfig.phone}`}>
                  {siteConfig.phone}
                </a>
              </li>
              <li>
                <a
                  className="hover:text-foreground"
                  href={`mailto:${siteConfig.email}`}
                >
                  {siteConfig.email}
                </a>
              </li>
            </ul>
            <div className="mt-4 flex gap-4 text-sm">
              {siteConfig.socials.instagram && (
                <a
                  className="text-muted hover:text-foreground"
                  href={siteConfig.socials.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram
                </a>
              )}
              {siteConfig.socials.tiktok && (
                <a
                  className="text-muted hover:text-foreground"
                  href={siteConfig.socials.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  TikTok
                </a>
              )}
              {siteConfig.socials.facebook && (
                <a
                  className="text-muted hover:text-foreground"
                  href={siteConfig.socials.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Facebook
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-line py-5 text-center text-xs text-muted">
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </div>
      </footer>
    </>
  );
}
