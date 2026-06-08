// Client-safe "Add to Google Calendar" URL builder (no server imports).

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalUrl(args: {
  title: string;
  details: string;
  start: Date;
  end: Date;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: args.title,
    details: args.details,
    dates: `${stamp(args.start)}/${stamp(args.end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
