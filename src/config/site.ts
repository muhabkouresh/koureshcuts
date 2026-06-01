// Single source of truth for business info and branding.
// PLACEHOLDER CONTENT — edit these values with your real details.

export const siteConfig = {
  name: "KoureshCuts",
  tagline: "Sharp cuts. Clean fades. Booked in seconds.",
  description:
    "KoureshCuts is a modern barbershop offering precision haircuts, skin fades, and beard grooming. Book your appointment online in under a minute.",

  // Contact / location (placeholders).
  phone: "(555) 123-4567",
  email: "hello@koureshcuts.com",
  address: "123 Main Street, Suite 4, Your City, ST 00000",

  // IANA timezone the shop operates in. All availability math uses this.
  // Change to your local zone, e.g. "America/Los_Angeles", "Europe/London".
  timezone: "America/New_York",

  // Social links (leave a value empty "" to hide it).
  socials: {
    instagram: "https://instagram.com/",
    tiktok: "",
    facebook: "",
  },

  // How far in advance customers may book (days).
  bookingWindowDays: 30,
  // Minimum lead time before an appointment can start (minutes).
  minLeadMinutes: 60,
} as const;

export type SiteConfig = typeof siteConfig;
