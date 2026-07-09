import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { verifyOfferToken } from "@/lib/token";
import { formatDateTimeLabel, nowMs } from "@/lib/time";
import { priceFull } from "@/lib/format";
import OfferClient from "./OfferClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Termin-Angebot — ${siteConfig.name}`,
  robots: { index: false },
};

// Landing page of the exclusive waitlist slot offer (from the offer email).
export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;

  const valid = verifyOfferToken(id, t);
  const offer = valid
    ? await prisma.slotOffer.findUnique({
        where: { id },
        include: { entry: true },
      })
    : null;
  const service = offer
    ? await prisma.service.findUnique({ where: { id: offer.serviceId } })
    : null;

  const live =
    offer !== null &&
    offer.entry !== null &&
    offer.status === "PENDING" &&
    offer.expiresAt.getTime() > nowMs();

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-2xl border border-line bg-background p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </h1>

        {!offer || !service ? (
          <p className="mt-4 text-sm text-muted">
            Dieser Link ist ungültig oder abgelaufen.
          </p>
        ) : offer.status === "ACCEPTED" ? (
          <p className="mt-4 text-sm">
            ✓ Dieser Termin ist bereits gebucht — du hast eine Bestätigung per
            E-Mail erhalten.
          </p>
        ) : !live ? (
          <p className="mt-4 text-sm text-muted">
            Dieses Angebot ist leider abgelaufen oder wurde weitergegeben. Du
            bleibst auf der Warteliste und bekommst das nächste passende
            Angebot automatisch.
          </p>
        ) : (
          <OfferClient
            id={offer.id}
            token={t ?? ""}
            customerName={offer.entry?.customerName ?? ""}
            serviceName={service.name}
            priceLabel={priceFull(service.priceCents)}
            whenLabel={formatDateTimeLabel(offer.startTime, siteConfig.timezone)}
            expiresLabel={formatDateTimeLabel(offer.expiresAt, siteConfig.timezone)}
          />
        )}
      </div>
    </main>
  );
}
