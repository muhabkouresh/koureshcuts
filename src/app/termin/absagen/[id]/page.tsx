import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { verifyCancelToken } from "@/lib/token";
import { formatDateTimeLabel } from "@/lib/time";
import { AppointmentStatus } from "@/lib/constants";
import CancelClient from "./CancelClient";

export const dynamic = "force-dynamic";

export default async function CancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;

  const valid = verifyCancelToken(id, t);
  const appt = valid
    ? await prisma.appointment.findUnique({
        where: { id },
        include: { service: true },
      })
    : null;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-2xl border border-line bg-background p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </h1>

        {!appt ? (
          <p className="mt-4 text-sm text-muted">
            Dieser Stornierungs-Link ist ungültig oder abgelaufen. Bitte ruf uns
            an: {siteConfig.phone}.
          </p>
        ) : (
          <CancelClient
            id={appt.id}
            token={t ?? ""}
            serviceName={appt.service.name}
            whenLabel={formatDateTimeLabel(appt.startTime, siteConfig.timezone)}
            alreadyCancelled={appt.status === AppointmentStatus.CANCELLED}
          />
        )}
      </div>
    </main>
  );
}
