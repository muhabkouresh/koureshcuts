import { Resend } from "resend";
import { siteConfig } from "@/config/site";
import { formatDateTimeLabel } from "./time";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "./calendar";

// Email delivery via Resend. When RESEND_API_KEY is unset (local dev), emails
// are logged to the console instead of being sent, so the flow is testable
// without an account.

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

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #ececec;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;letter-spacing:-0.01em">${siteConfig.name}</h1>
      <h2 style="margin:0 0 20px;font-size:16px;font-weight:600;color:#444">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#9a9a9a;font-size:12px;margin-top:20px">
      ${siteConfig.name} · ${siteConfig.address}<br/>${siteConfig.phone}
    </p>
  </div></body></html>`;
}

function detailsTable(data: BookingEmailData): string {
  const when = formatDateTimeLabel(data.start, siteConfig.timezone);
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:8px 0;color:#888">Service</td><td style="padding:8px 0;text-align:right;font-weight:600">${data.serviceName}</td></tr>
    <tr><td style="padding:8px 0;color:#888">When</td><td style="padding:8px 0;text-align:right;font-weight:600">${when}</td></tr>
    <tr><td style="padding:8px 0;color:#888">Price</td><td style="padding:8px 0;text-align:right;font-weight:600">${money(data.priceCents)} (pay in shop)</td></tr>
  </table>`;
}

function calendarEvent(data: BookingEmailData): CalendarEvent {
  return {
    title: `${data.serviceName} — ${siteConfig.name}`,
    description: `Your ${data.serviceName} appointment at ${siteConfig.name}. Payment in shop.`,
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
      `\n[email:dev] To: ${to}\n[email:dev] Subject: ${subject}` +
        (attachIcs ? `\n[email:dev] (with calendar.ics attachment)` : "") +
        `\n[email:dev] (set RESEND_API_KEY to actually send)\n`,
    );
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    attachments: attachIcs
      ? [{ filename: "appointment.ics", content: Buffer.from(attachIcs) }]
      : undefined,
  });
}

/** Confirmation to the customer (with calendar) + a heads-up to the shop owner. */
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
    "Your appointment is booked ✂️",
    `<p style="font-size:14px;color:#444">Hi ${data.customerName}, thanks for booking. Here are your details:</p>
     ${detailsTable(data)}
     <div style="margin-top:24px">
       <a href="${gcal}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600">Add to Google Calendar</a>
     </div>
     <p style="font-size:13px;color:#888;margin-top:16px">A calendar file is attached, and we'll send a reminder the day before. Need to change or cancel? Reply to this email or call ${siteConfig.phone}.</p>`,
  );

  await send({
    to: data.customerEmail,
    subject: `Booked: ${data.serviceName} — ${formatDateTimeLabel(data.start, siteConfig.timezone)}`,
    html: customerHtml,
    attachIcs: ics,
  });

  // Owner notification.
  if (siteConfig.email) {
    const ownerHtml = layout(
      "New booking",
      `${detailsTable(data)}
       <p style="font-size:13px;color:#888;margin-top:16px">Customer: ${data.customerName} · ${data.customerEmail}</p>`,
    );
    await send({
      to: siteConfig.email,
      subject: `New booking: ${data.customerName} — ${data.serviceName}`,
      html: ownerHtml,
    });
  }
}

/** Day-before reminder to the customer. */
export async function sendReminderEmail(data: BookingEmailData): Promise<void> {
  const html = layout(
    "Appointment reminder",
    `<p style="font-size:14px;color:#444">Hi ${data.customerName}, this is a reminder for your appointment tomorrow:</p>
     ${detailsTable(data)}
     <p style="font-size:13px;color:#888;margin-top:16px">See you soon! Need to change it? Call ${siteConfig.phone}.</p>`,
  );
  await send({
    to: data.customerEmail,
    subject: `Reminder: ${data.serviceName} tomorrow at ${siteConfig.name}`,
    html,
  });
}
