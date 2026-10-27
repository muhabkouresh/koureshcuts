export class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "HttpError"; }
}

/** Bounded GET requests. Failed/invalid responses must never look like empty data. */
export async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await fetch(url, { ...options, cache: "no-store", signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new HttpError(body?.error || "Daten konnten nicht geladen werden.", response.status);
    if (!body || typeof body !== "object") throw new Error("Ungültige Antwort. Bitte erneut laden.");
    return body as T;
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) throw new Error("Das Laden dauert zu lange. Bitte erneut versuchen.");
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
