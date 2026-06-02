import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { minutesToHHMM } from "@/lib/time";
import BookingFlow, { type Service } from "@/components/booking/BookingFlow";

export const dynamic = "force-dynamic";

const WEEKDAY_NAMES = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
// Display order: Monday-first, Sunday last.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
  const hoursByDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-5 py-14 text-center sm:py-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={`${siteConfig.name} Barber`}
            className="w-52 sm:w-72"
          />
          {/* Logo already contains the brand name; keep an H1 for SEO. */}
          <h1 className="sr-only">{siteConfig.name}</h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
            {siteConfig.tagline}
          </p>
          <Link
            href="#book"
            className="mt-8 rounded-full bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Service auswählen
          </Link>
        </div>
      </section>

      {/* Booking (services + flow) */}
      <main className="flex-1">
        <section id="book" className="mx-auto max-w-5xl scroll-mt-6 px-5 py-16">
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
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:grid-cols-3">
          <div>
            <p className="text-lg font-bold tracking-tight">{siteConfig.name}</p>
            <p className="mt-2 max-w-xs text-sm text-muted">
              {siteConfig.description}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Öffnungszeiten</h3>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {DISPLAY_ORDER.map((dow) => {
                const h = hoursByDay.get(dow);
                const label =
                  !h || h.isClosed
                    ? "Geschlossen"
                    : `${minutesToHHMM(h.openMinute)} – ${minutesToHHMM(
                        h.closeMinute,
                      )} Uhr`;
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
            <h3 className="text-sm font-semibold">Kontakt</h3>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>{siteConfig.address}</li>
              <li>
                <a
                  className="hover:text-foreground"
                  href={`tel:${siteConfig.phone}`}
                >
                  {siteConfig.phone}
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
          © {new Date().getFullYear()} {siteConfig.name}. Alle Rechte vorbehalten.
        </div>
      </footer>
    </>
  );
}
