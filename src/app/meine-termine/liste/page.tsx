import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { verifyEmailToken, cancelToken } from "@/lib/token";
import { formatDateLabel, formatDateTimeLabel, nowMs } from "@/lib/time";
import { priceFull } from "@/lib/format";
import { ACTIVE_STATUSES } from "@/lib/constants";
import RememberDevice from "./RememberDevice";
import WaitlistSection from "./WaitlistSection";
import PushOptIn from "@/components/ui/PushOptIn";

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Human label of what a waitlist entry is waiting for.
function wishLabel(entry: { date: Date | null; weekdays: string }): string {
  if (entry.date) {
    return `Wunschtag: ${formatDateLabel(entry.date, siteConfig.timezone)}`;
  }
  if (entry.weekdays) {
    const names = entry.weekdays
      .split(",")
      .map((d) => WEEKDAY_SHORT[Number(d)] ?? "")
      .filter(Boolean)
      .join(", ");
    return `Nächster freier Termin (${names})`;
  }
  return "Nächster freier Termin (jeder Tag)";
}

// Status → short German label + badge style for the history section.
function historyBadge(status: string): { label: string; cls: string } {
  if (status === "CANCELLED")
    return { label: "storniert", cls: "bg-red-50 text-red-700" };
  if (status === "NO_SHOW")
    return { label: "nicht erschienen", cls: "bg-orange-50 text-orange-700" };
  return { label: "wahrgenommen", cls: "bg-emerald-50 text-emerald-700" };
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Meine Termine — ${siteConfig.name}`,
  robots: { index: false },
};

// Token-guarded list of a customer's upcoming appointments with manage links.
// Reached via the magic link from the "Meine Termine" email.
export default async function MyAppointmentsListPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e, t } = await searchParams;

  let email = "";
  try {
    email = Buffer.from(e ?? "", "base64url").toString("utf8");
  } catch {
    // Malformed parameter — handled as invalid below.
  }
  const valid = email.length > 0 && verifyEmailToken(email, t);

  const appointments = valid
    ? await prisma.appointment.findMany({
        where: {
          customerEmail: { equals: email, mode: "insensitive" },
          status: { in: ACTIVE_STATUSES },
          startTime: { gte: new Date(nowMs()) },
        },
        orderBy: { startTime: "asc" },
        include: { service: { select: { name: true, priceCents: true } } },
      })
    : [];

  // Waitlist entries of this customer, each with its live queue position.
  const waitlistEntries = valid
    ? await prisma.waitlistEntry.findMany({
        where: { customerEmail: { equals: email, mode: "insensitive" } },
        include: { service: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const waitlistWithPosition = await Promise.all(
    waitlistEntries.map(async (w) => ({
      id: w.id,
      serviceName: w.service.name,
      wishLabel: wishLabel(w),
      position: await prisma.waitlistEntry.count({
        where: {
          AND: [
            // Stale entries for past days don't count toward the position.
            { OR: [{ date: null }, { date: { gte: new Date(nowMs() - 24 * 60 * 60_000) } }] },
            { createdAt: { lte: w.createdAt } },
          ],
        },
      }),
    })),
  );

  // Booking history: the most recent past appointments (attended, cancelled,
  // no-show). Admin slot blocks are internal and never shown.
  const history = valid
    ? await prisma.appointment.findMany({
        where: {
          customerEmail: { equals: email, mode: "insensitive" },
          status: { not: "BLOCKED" },
          startTime: { lt: new Date(nowMs()) },
        },
        orderBy: { startTime: "desc" },
        take: 10,
        include: { service: { select: { name: true } } },
      })
    : [];

  return (
    <main className="flex flex-1 items-start justify-center px-5 py-14">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-background p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </h1>

        {!valid ? (
          <p className="mt-4 text-sm text-muted">
            Dieser Link ist ungültig oder abgelaufen. Du kannst{" "}
            <Link
              href="/meine-termine"
              className="text-brand underline underline-offset-2"
            >
              hier einen neuen Link anfordern
            </Link>
            .
          </p>
        ) : (
          <>
            <RememberDevice e={e ?? ""} t={t ?? ""} />
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              Deine Termine
            </h2>
            <p className="mt-1 text-sm text-muted">{email}</p>

            {appointments.length === 0 ? (
              <div className="mt-5">
                <p className="rounded-xl bg-surface px-4 py-4 text-sm text-muted">
                  Du hast aktuell keine anstehenden Termine.
                </p>
                <Link
                  href="/#book"
                  className="mt-4 inline-block rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white"
                >
                  Jetzt Termin buchen
                </Link>
              </div>
            ) : (
              <ul className="mt-5 flex flex-col gap-3">
                {appointments.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-2xl border border-line bg-surface p-4"
                  >
                    <p className="font-semibold">{a.service.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {formatDateTimeLabel(a.startTime, siteConfig.timezone)} ·{" "}
                      {priceFull(a.service.priceCents)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <a
                        href={`/termin/verschieben/${a.id}?t=${cancelToken(a.id)}`}
                        className="rounded-lg border border-line bg-background px-3 py-1.5 font-medium hover:border-brand hover:text-brand"
                      >
                        Verschieben
                      </a>
                      <a
                        href={`/termin/absagen/${a.id}?t=${cancelToken(a.id)}`}
                        className="rounded-lg border border-line bg-background px-3 py-1.5 font-medium hover:border-red-400 hover:text-red-600"
                      >
                        Absagen
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {appointments.length > 0 && (
              <PushOptIn
                reminderOnly
                email={email}
                title="Erinnerung auch als Push aufs Handy?"
                label="🔔 Push-Erinnerung aktivieren"
                activeText="🔔 Aktiv — deine Termin-Erinnerung kommt zusätzlich als Push auf dieses Gerät."
                hint="iPhone: funktioniert nur, wenn du die Seite über „Teilen → Zum Home-Bildschirm“ als App hinzugefügt hast."
              />
            )}

            <WaitlistSection
              entries={waitlistWithPosition}
              e={e ?? ""}
              t={t ?? ""}
            />

            {history.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-muted">
                  Vergangene Termine
                </h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {history.map((a) => {
                    const badge = historyBadge(a.status);
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-background px-4 py-3 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {a.service.name}
                          </span>
                          <span className="block text-xs text-muted">
                            {formatDateTimeLabel(
                              a.startTime,
                              siteConfig.timezone,
                            )}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-1 text-xs text-muted">
              <p>
                Neuen Termin buchen?{" "}
                <Link href="/" className="text-brand underline underline-offset-2">
                  Zur Startseite
                </Link>
              </p>
              <p>
                Dieses Gerät merkt sich deine Termine — beim nächsten Besuch
                von „Meine Termine“ bist du direkt hier.{" "}
                <Link
                  href="/meine-termine"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Andere E-Mail verwenden
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
