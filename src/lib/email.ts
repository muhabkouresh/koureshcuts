import { Resend } from "resend";
import { siteConfig } from "@/config/site";
import { formatDateTimeLabel, formatClock, formatLongDate } from "./time";
import { priceFull } from "./format";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "./calendar";
import { cancelUrl } from "./token";

// Email delivery via Resend. When RESEND_API_KEY is unset (local dev), emails
// are logged to the console instead of being sent, so the flow is testable
// without an account. All content is in German to match the site.

export type BookingEmailData = {
  id: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  priceCents: number;
  start: Date;
  end: Date;
};

// Sender address. Defaults to the configured shop address (siteConfig). A
// FROM_EMAIL env var may override it, but Resend's test sender
// (onboarding@resend.dev) is ignored — it can only mail the account owner, so
// production must never fall back to it.
const envFrom = process.env.FROM_EMAIL;
const FROM =
  envFrom && !envFrom.includes("resend.dev")
    ? envFrom
    : `${siteConfig.name} <${siteConfig.email}>`;
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;letter-spacing:-0.01em">${siteConfig.name}</h1>
      ${title ? `<h2 style="margin:0 0 20px;font-size:16px;font-weight:600;color:#444">${title}</h2>` : ""}
      ${bodyHtml}
    </div>
  </div></body></html>`;
}

function detailsTable(data: BookingEmailData): string {
  const when = formatDateTimeLabel(data.start, siteConfig.timezone);
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:8px 0;color:#888">Service</td><td style="padding:8px 0;text-align:right;font-weight:600">${data.serviceName}</td></tr>
    <tr><td style="padding:8px 0;color:#888">Termin</td><td style="padding:8px 0;text-align:right;font-weight:600">${when}</td></tr>
    <tr><td style="padding:8px 0;color:#888">Preis</td><td style="padding:8px 0;text-align:right;font-weight:600">${priceFull(data.priceCents)} (Zahlung vor Ort)</td></tr>
  </table>`;
}

function calendarEvent(data: BookingEmailData): CalendarEvent {
  return {
    title: `${data.serviceName} — ${siteConfig.name}`,
    description: `Dein Termin (${data.serviceName}) bei ${siteConfig.name}. Zahlung vor Ort.`,
    location: siteConfig.address,
    start: data.start,
    end: data.end,
  };
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  attachIcs?: string;
};

async function send({
  to,
  subject,
  html,
  attachIcs,
}: SendArgs): Promise<{ ok: boolean }> {
  if (!resend) {
    console.log(
      `\n[email:dev] An: ${to}\n[email:dev] Betreff: ${subject}` +
        (attachIcs ? `\n[email:dev] (mit Kalender-Anhang appointment.ics)` : "") +
        `\n[email:dev] (RESEND_API_KEY setzen, um wirklich zu senden)\n`,
    );
    // In dev (no API key) treat as delivered so the flow stays testable.
    return { ok: true };
  }
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    attachments: attachIcs
      ? [{ filename: "termin.ics", content: Buffer.from(attachIcs) }]
      : undefined,
  });
  if (error) {
    console.error(`[resend] Versand an ${to} fehlgeschlagen:`, error);
    return { ok: false };
  }
  console.log(`[resend] gesendet an ${to} (id ${data?.id})`);
  return { ok: true };
}

/** Confirmation to the customer (with calendar) + a heads-up to the owner. */
export async function sendConfirmationEmails(data: BookingEmailData): Promise<void> {
  const event = calendarEvent(data);
  const gcal = googleCalendarUrl(event);
  // Apple Calendar opens the .ics file; link to the hosted download.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const icsUrl = `${siteUrl}/api/appointments/${data.id}/ics`;
  let ics: string | undefined;
  try {
    ics = buildIcs(event);
  } catch (e) {
    console.error("ics build failed", e);
  }

  const tz = siteConfig.timezone;
  const durationMin = Math.round(
    (data.end.getTime() - data.start.getTime()) / 60000,
  );
  const rows: [string, string][] = [
    ["Service", data.serviceName],
    ["Datum", formatLongDate(data.start, tz)],
    ["Uhrzeit", `${formatClock(data.start, tz)} – ${formatClock(data.end, tz)}`],
    ["Dauer", `${durationMin} Min`],
    ["Preis", priceFull(data.priceCents)],
    ["Mitarbeiter", siteConfig.name],
    ["Buchungs-ID", data.id],
  ];
  const detailRows = rows
    .map(
      ([l, v]) =>
        `<tr><td style="padding:7px 0;color:#888;font-size:13px;vertical-align:top">${l}</td><td style="padding:7px 0;text-align:right;font-weight:600;font-size:13px;word-break:break-word">${v}</td></tr>`,
    )
    .join("");

  const customerHtml = layout(
    "",
    `<div style="text-align:center">
       <div style="width:56px;height:56px;border-radius:50%;background:#1f9d3b;margin:8px auto 18px;line-height:56px;color:#fff;font-size:28px;font-weight:700">&#10003;</div>
       <h2 style="margin:0;font-size:22px;font-weight:700">Dein Termin wurde bestätigt</h2>
       <p style="font-size:14px;color:#555;margin:14px 0 0">Hallo ${data.customerName},<br/>Vielen Dank. Dein Termin wurde bestätigt.</p>
       <div style="margin:22px 0 8px">
         <a href="${cancelUrl(data.id)}" style="display:inline-block;background:#fff;border:1px solid #d6d3d1;color:#18181b;text-decoration:none;padding:13px 30px;border-radius:999px;font-size:15px;font-weight:700">Termin stornieren</a>
       </div>
       <p style="font-size:13px;color:#888;margin:6px 0 4px">Zum Kalender hinzufügen</p>
       <div style="margin:0 0 4px">
         <a href="${gcal}" style="font-size:13px;color:#8a1f2b;text-decoration:underline">Google Kalender</a>
         <span style="color:#d6d3d1;margin:0 8px">·</span>
         <a href="${icsUrl}" style="font-size:13px;color:#8a1f2b;text-decoration:underline">Apple Kalender</a>
       </div>
     </div>
     <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
     <table style="width:100%;border-collapse:collapse">${detailRows}</table>
     <p style="font-size:12px;color:#9ca3af;margin-top:18px">Eine Kalenderdatei (.ics) ist ebenfalls angehängt.</p>`,
  );

  await send({
    to: data.customerEmail,
    subject: `Bestätigt: ${data.serviceName} — ${formatDateTimeLabel(data.start, siteConfig.timezone)}`,
    html: customerHtml,
    attachIcs: ics,
  });

  // Owner notification.
  if (siteConfig.ownerEmail) {
    const ownerHtml = layout(
      "Neue Buchung",
      `${detailsTable(data)}
       <p style="font-size:13px;color:#888;margin-top:16px">Kunde: ${data.customerName} · ${data.customerEmail}</p>`,
    );
    await send({
      to: siteConfig.ownerEmail,
      subject: `Neue Buchung: ${data.customerName} — ${data.serviceName}`,
      html: ownerHtml,
    });
  }
}

export type WaitlistEmailData = {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  date: Date;
};

/** Confirm to the customer they're on the waitlist + notify the owner. */
export async function sendWaitlistJoinedEmails(
  data: WaitlistEmailData,
): Promise<void> {
  const day = formatLongDate(data.date, siteConfig.timezone);

  const customerHtml = layout(
    "",
    `<div style="text-align:center">
       <div style="width:56px;height:56px;border-radius:50%;background:#8a1f2b;margin:8px auto 18px;line-height:56px;color:#fff;font-size:26px;font-weight:700">&#9203;</div>
       <h2 style="margin:0;font-size:21px;font-weight:700">Du stehst auf der Warteliste</h2>
       <p style="font-size:14px;color:#555;margin:14px 0 0">Hallo ${data.customerName},<br/>
       der ${day} ist aktuell ausgebucht. Wir haben dich für <strong>${data.serviceName}</strong> auf die Warteliste gesetzt
       und melden uns, sobald ein Platz frei wird.</p>
     </div>`,
  );
  await send({
    to: data.customerEmail,
    subject: `Warteliste: ${data.serviceName} am ${day}`,
    html: customerHtml,
  });

  if (siteConfig.ownerEmail) {
    const ownerHtml = layout(
      "Neue Warteliste-Anfrage",
      `<table style="width:100%;border-collapse:collapse;font-size:14px">
         <tr><td style="padding:8px 0;color:#888">Service</td><td style="padding:8px 0;text-align:right;font-weight:600">${data.serviceName}</td></tr>
         <tr><td style="padding:8px 0;color:#888">Wunschtag</td><td style="padding:8px 0;text-align:right;font-weight:600">${day}</td></tr>
       </table>
       <p style="font-size:13px;color:#888;margin-top:16px">Kunde: ${data.customerName} · ${data.customerEmail}</p>`,
    );
    await send({
      to: siteConfig.ownerEmail,
      subject: `Warteliste: ${data.customerName} — ${data.serviceName} (${day})`,
      html: ownerHtml,
    });
  }
}

/** Tell a waitlisted customer a spot opened up (owner-triggered from admin). */
export async function sendWaitlistSpotEmail(
  data: WaitlistEmailData,
): Promise<{ ok: boolean }> {
  const day = formatLongDate(data.date, siteConfig.timezone);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const html = layout(
    "Ein Platz ist frei geworden!",
    `<p style="font-size:14px;color:#444">Hallo ${data.customerName},<br/>
       gute Nachrichten — für <strong>${data.serviceName}</strong> am <strong>${day}</strong> ist ein Termin frei geworden.
       Sei schnell und sichere ihn dir:</p>
     <div style="margin:22px 0 8px;text-align:center">
       <a href="${siteUrl}/#book" style="display:inline-block;background:#8a1f2b;color:#fff;text-decoration:none;padding:13px 30px;border-radius:999px;font-size:15px;font-weight:700">Jetzt Termin buchen</a>
     </div>`,
  );
  return send({
    to: data.customerEmail,
    subject: `Platz frei: ${data.serviceName} am ${day}`,
    html,
  });
}

/** Reminder to the customer ahead of the appointment. */
export async function sendReminderEmail(data: BookingEmailData): Promise<void> {
  const html = layout(
    "Termin-Erinnerung",
    `<p style="font-size:14px;color:#444">Hallo ${data.customerName}, das ist eine Erinnerung an deinen Termin:</p>
     ${detailsTable(data)}
     <div style="margin-top:20px">
       <a href="${cancelUrl(data.id)}" style="display:inline-block;border:1px solid #e5e7eb;color:#8a1f2b;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:600">Termin absagen</a>
     </div>
     <p style="font-size:13px;color:#888;margin-top:16px">Bis bald!</p>`,
  );
  await send({
    to: data.customerEmail,
    subject: `Erinnerung: ${data.serviceName} bei ${siteConfig.name}`,
    html,
  });
}

/** Notify the owner that a customer cancelled (slot freed up). */
export async function sendCancellationNotice(
  data: BookingEmailData,
  reason?: string,
): Promise<void> {
  if (!siteConfig.ownerEmail) return;
  const reasonRow = reason?.trim()
    ? `<p style="font-size:13px;color:#444;margin-top:12px"><strong>Absagegrund:</strong> ${reason.trim()}</p>`
    : "";
  const html = layout(
    "Termin storniert",
    `<p style="font-size:14px;color:#444">Ein Kunde hat seinen Termin storniert – der Slot ist wieder frei:</p>
     ${detailsTable(data)}
     ${reasonRow}
     <p style="font-size:13px;color:#888;margin-top:16px">Kunde: ${data.customerName}${data.customerEmail ? ` · ${data.customerEmail}` : ""}</p>`,
  );
  await send({
    to: siteConfig.ownerEmail,
    subject: `Storniert: ${data.customerName} — ${data.serviceName}`,
    html,
  });
}
