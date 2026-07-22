import { createEvent, createEvents, type EventAttributes } from "ics";
import { siteConfig } from "@/config/site";

export type CalendarEvent = {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  /**
   * Stable identifier (e.g. "<appointmentId>@koureshcuts.de"). Without it a
   * random UID is generated per download, so tapping the link twice — or
   * after a reschedule — creates DUPLICATE events instead of updating the
   * existing one. Always set this for appointment events.
   */
  uid?: string;
};

/** UTC date components (ics expects [year, month, day, hour, minute]). */
function utcParts(d: Date): [number, number, number, number, number] {
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];
}

/** Build an .ics calendar file string for an appointment. */
export function buildIcs(event: CalendarEvent): string {
  const attributes: EventAttributes = {
    title: event.title,
    description: event.description,
    location: event.location,
    start: utcParts(event.start),
    startInputType: "utc",
    end: utcParts(event.end),
    endInputType: "utc",
    productId: siteConfig.name,
    calName: siteConfig.name,
    status: "CONFIRMED",
    uid: event.uid,
    // Monotonic SEQUENCE: a newer download of the same UID (e.g. after a
    // reschedule) replaces the calendar entry instead of being ignored.
    sequence: Math.floor(Date.now() / 1000),
  };

  const { error, value } = createEvent(attributes);
  if (error || !value) {
    throw error ?? new Error("Failed to build calendar event.");
  }
  return value;
}

/** Build a multi-event .ics feed (for calendar subscription). */
export function buildIcsFeed(events: CalendarEvent[]): string {
  if (events.length === 0) {
    // Minimal valid empty calendar.
    return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:${siteConfig.name}\r\nCALSCALE:GREGORIAN\r\nNAME:${siteConfig.name} Termine\r\nX-WR-CALNAME:${siteConfig.name} Termine\r\nEND:VCALENDAR\r\n`;
  }
  const attrs: EventAttributes[] = events.map((event) => ({
    title: event.title,
    description: event.description,
    location: event.location,
    start: utcParts(event.start),
    startInputType: "utc",
    end: utcParts(event.end),
    endInputType: "utc",
    productId: siteConfig.name,
    calName: `${siteConfig.name} Termine`,
    status: "CONFIRMED",
    uid: event.uid,
    sequence: Math.floor(Date.now() / 1000),
  }));

  const { error, value } = createEvents(attrs);
  if (error || !value) {
    throw error ?? new Error("Failed to build calendar feed.");
  }
  return value;
}

/** Format a Date as a UTC basic timestamp, e.g. 20260601T143000Z. */
function gcalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Build an "Add to Google Calendar" URL. Address is intentionally omitted. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: event.description,
    dates: `${gcalStamp(event.start)}/${gcalStamp(event.end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
