import { fetchJson } from "./fetchJson";

export type DaySlots = { slots: { start: string; end: string }[] };
export function validDaySlots(data: DaySlots): boolean {
  return Array.isArray(data?.slots) && data.slots.every(slot => typeof slot.start === "string" && typeof slot.end === "string" && Number.isFinite(Date.parse(slot.start)) && Number.isFinite(Date.parse(slot.end)));
}
export async function fetchDaySlots(url: string, signal?: AbortSignal): Promise<DaySlots> {
  const data = await fetchJson<DaySlots>(url, { signal });
  if (!validDaySlots(data)) throw new Error("Termine konnten nicht geladen werden.");
  return data;
}
