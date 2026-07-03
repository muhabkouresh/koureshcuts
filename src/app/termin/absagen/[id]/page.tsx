import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { verifyCancelToken } from "@/lib/token";
import { formatDateTimeLabel, nowMs } from "@/lib/time";
import { AppointmentStatus } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
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
  const settings = appt ? await getSettings() : null;
  const deadlineMs = (settings?.cancelDeadlineHours ?? 0) * 3600_000;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-2xl border border-line bg-background p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </h1>

        {!appt ? (
          <p className="mt-4 text-sm text-muted">
            Dieser Stornierungs-Link ist ungültig oder abgelaufen.
            {siteConfig.phone
              ? ` Bitte ruf uns an: ${siteConfig.phone}.`
              : " Bitte wende dich direkt an uns, um deinen Termin zu ändern."}
          </p>
        ) : (
          <CancelClient
            id={appt.id}
            token={t ?? ""}
            serviceName={appt.service.name}
            whenLabel={formatDateTimeLabel(appt.startTime, siteConfig.timezone)}
            alreadyCancelled={appt.status === AppointmentStatus.CANCELLED}
            cancellable={
              (appt.status === AppointmentStatus.PENDING ||
                appt.status === AppointmentStatus.CONFIRMED) &&
              appt.startTime.getTime() - deadlineMs > nowMs()
            }
            deadlineHours={settings?.cancelDeadlineHours ?? 0}
            isUpcoming={appt.startTime.getTime() > nowMs()}
          />
        )}
      </div>
    </main>
  );
}
