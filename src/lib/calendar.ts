import { createEvent, type EventAttributes } from "ics";
import { siteConfig } from "@/config/site";

export type CalendarEvent = {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
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
  };

  const { error, value } = createEvent(attributes);
  if (error || !value) {
    throw error ?? new Error("Failed to build calendar event.");
  }
  return value;
}

/** Format a Date as a UTC basic timestamp, e.g. 20260601T143000Z. */
function gcalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Build an "Add to Google Calendar" URL. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: event.description,
    location: event.location,
    dates: `${gcalStamp(event.start)}/${gcalStamp(event.end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
