import { Resend } from "resend";
import { siteConfig } from "@/config/site";
import { formatDateTimeLabel } from "./time";
import { priceFull } from "./format";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "./calendar";

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

const FROM = process.env.FROM_EMAIL || `${siteConfig.name} <onboarding@resend.dev>`;
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;letter-spacing:-0.01em">${siteConfig.name}</h1>
      <h2 style="margin:0 0 20px;font-size:16px;font-weight:600;color:#444">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px">
      ${siteConfig.name} · ${siteConfig.address}<br/>${siteConfig.phone}
    </p>
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

async function send({ to, subject, html, attachIcs }: SendArgs): Promise<void> {
  if (!resend) {
    console.log(
      `\n[email:dev] An: ${to}\n[email:dev] Betreff: ${subject}` +
        (attachIcs ? `\n[email:dev] (mit Kalender-Anhang appointment.ics)` : "") +
        `\n[email:dev] (RESEND_API_KEY setzen, um wirklich zu senden)\n`,
    );
    return;
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
  } else {
    console.log(`[resend] gesendet an ${to} (id ${data?.id})`);
  }
}

/** Confirmation to the customer (with calendar) + a heads-up to the owner. */
export async function sendConfirmationEmails(data: BookingEmailData): Promise<void> {
  const event = calendarEvent(data);
  const gcal = googleCalendarUrl(event);
  let ics: string | undefined;
  try {
    ics = buildIcs(event);
  } catch (e) {
    console.error("ics build failed", e);
  }

  const customerHtml = layout(
    "Dein Termin ist gebucht ✂️",
    `<p style="font-size:14px;color:#444">Hallo ${data.customerName}, danke für deine Buchung. Hier sind deine Details:</p>
     ${detailsTable(data)}
     <div style="margin-top:24px">
       <a href="${gcal}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600">Zum Google Kalender hinzufügen</a>
     </div>
     <p style="font-size:13px;color:#888;margin-top:16px">Eine Kalenderdatei ist angehängt, und wir erinnern dich am Tag vorher. Termin ändern oder absagen? Antworte auf diese E-Mail oder ruf an: ${siteConfig.phone}.</p>`,
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

/** Day-before reminder to the customer. */
export async function sendReminderEmail(data: BookingEmailData): Promise<void> {
  const html = layout(
    "Termin-Erinnerung",
    `<p style="font-size:14px;color:#444">Hallo ${data.customerName}, das ist eine Erinnerung an deinen Termin morgen:</p>
     ${detailsTable(data)}
     <p style="font-size:13px;color:#888;margin-top:16px">Bis bald! Termin ändern? Ruf an: ${siteConfig.phone}.</p>`,
  );
  await send({
    to: data.customerEmail,
    subject: `Erinnerung: ${data.serviceName} morgen bei ${siteConfig.name}`,
    html,
  });
}
