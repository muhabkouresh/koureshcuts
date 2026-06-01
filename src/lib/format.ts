import { siteConfig } from "@/config/site";

// Currency formatting in the shop's locale (client- and server-safe).

const euro0 = new Intl.NumberFormat(siteConfig.locale, {
  style: "currency",
  currency: siteConfig.currency,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const euro2 = new Intl.NumberFormat(siteConfig.locale, {
  style: "currency",
  currency: siteConfig.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Compact price, e.g. "15 €" (drops cents when whole). */
export function priceShort(cents: number): string {
  const value = cents / 100;
  return Number.isInteger(value) ? euro0.format(value) : euro2.format(value);
}

/** Full price with cents, e.g. "15,00 €". */
export function priceFull(cents: number): string {
  return euro2.format(cents / 100);
}
