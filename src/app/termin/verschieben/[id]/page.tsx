import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { verifyCancelToken } from "@/lib/token";
import { formatDateTimeLabel } from "@/lib/time";
import { AppointmentStatus } from "@/lib/constants";
import RescheduleClient from "./RescheduleClient";

export const dynamic = "force-dynamic";

export default async function ReschedulePage({
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

  const active =
    appt !== null &&
    (appt.status === AppointmentStatus.PENDING ||
      appt.status === AppointmentStatus.CONFIRMED) &&
    appt.startTime > new Date();

  return (
    <main className="flex flex-1 items-start justify-center px-5 py-14">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-background p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </h1>

        {!appt ? (
          <p className="mt-4 text-sm text-muted">
            Dieser Link ist ungültig oder abgelaufen.
            {siteConfig.phone
              ? ` Bitte ruf uns an: ${siteConfig.phone}.`
              : " Bitte wende dich direkt an uns, um deinen Termin zu ändern."}
          </p>
        ) : !active ? (
          <p className="mt-4 text-sm text-muted">
            Dieser Termin kann nicht mehr verschoben werden (er liegt in der
            Vergangenheit oder wurde bereits storniert). Du kannst jederzeit
            einen neuen Termin auf unserer Seite buchen.
          </p>
        ) : (
          <RescheduleClient
            id={appt.id}
            token={t ?? ""}
            serviceId={appt.serviceId}
            serviceName={appt.service.name}
            durationMinutes={appt.service.durationMinutes}
            currentLabel={formatDateTimeLabel(
              appt.startTime,
              siteConfig.timezone,
            )}
          />
        )}
      </div>
    </main>
  );
}
