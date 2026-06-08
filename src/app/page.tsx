import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import BookingFlow, { type Service } from "@/components/booking/BookingFlow";

export const dynamic = "force-dynamic";

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
      {/* Hero — logo as a subtle full-width backdrop, content in the foreground */}
      <section className="relative overflow-hidden border-b border-line bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-center select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="w-[150%] max-w-none -translate-y-[8%] opacity-[0.10] sm:w-full sm:max-w-5xl"
          />
        </div>

        <div className="relative mx-auto flex max-w-2xl flex-col items-center px-5 py-28 text-center sm:py-36">
          <h1 className="sr-only">{siteConfig.name}</h1>
          <p className="font-display max-w-xl text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl">
            {siteConfig.tagline}
          </p>
          <Link
            href="#book"
            className="mt-9 rounded-full bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
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
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-5 py-8 text-center text-xs text-muted">
          <Link
            href="/datenschutz"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Datenschutzerklärung
          </Link>
          <span>
            © {new Date().getFullYear()} {siteConfig.name}. Alle Rechte
            vorbehalten.
          </span>
        </div>
      </footer>
    </>
  );
}
