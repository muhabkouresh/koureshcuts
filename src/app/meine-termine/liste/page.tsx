import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { verifyEmailToken, cancelToken } from "@/lib/token";
import { formatDateTimeLabel, nowMs } from "@/lib/time";
import { priceFull } from "@/lib/format";
import { ACTIVE_STATUSES } from "@/lib/constants";

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

            <p className="mt-6 text-xs text-muted">
              Neuen Termin buchen?{" "}
              <Link href="/" className="text-brand underline underline-offset-2">
                Zur Startseite
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
