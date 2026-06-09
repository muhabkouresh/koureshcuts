// Single source of truth for business info and branding.
// Edit these values with your real details.

export const siteConfig = {
  name: "Kouresh_cuts",
  // Shown in the hero. Matches the live site.
  tagline:
    "Sichere dir deinen Termin bequem online – schnell, einfach und mit sofortiger Bestätigung per E-Mail",
  description:
    "Online-Terminbuchung für Kouresh_cuts. Wähle deinen Service, finde einen freien Termin und buche in unter einer Minute.",

  // Contact / location (leave empty to hide; fill in with real details later).
  phone: "",
  // Address of the shop (leave empty to hide; used as the calendar event location).
  address: "",
  // Owner inbox that receives a copy of every new booking.
  ownerEmail: "muhabkouresh05@gmail.com",
  // "From" sender shown on customer emails (display name).
  email: "termine@kouresh-cuts.de",

  // Locale + currency used for all formatting.
  locale: "de-DE",
  currency: "EUR",

  // IANA timezone the shop operates in.
  timezone: "Europe/Berlin",

  // Social links (leave a value empty "" to hide it).
  socials: {
    instagram: "https://instagram.com/kouresh_cuts",
    tiktok: "",
    facebook: "",
  },

  // How far in advance customers may book (days).
  bookingWindowDays: 30,
  // Minimum lead time before an appointment can start (minutes).
  minLeadMinutes: 60,
} as const;

export type SiteConfig = typeof siteConfig;
