"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, HttpError } from "@/lib/fetchJson";

type Snapshot<T> = { url: string; data: T; updatedAt: string };

/** One in-flight read per resource; resumes/reconnects always revalidate. */
export function useLiveResource<T>(url: string | null, {
  initialData = null, initialUpdatedAt = null, intervalMs = 30_000, active = true, validate,
}: { initialData?: T | null; initialUpdatedAt?: string | null; intervalMs?: number; active?: boolean; validate?: (data: T) => boolean } = {}) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(() =>
    url && initialData ? { url, data: initialData, updatedAt: initialUpdatedAt || new Date().toISOString() } : null);
  const [state, setState] = useState<{ url: string | null; busy: boolean; error: string | null; unauthorized: boolean }>(
    { url, busy: false, error: null, unauthorized: false });
  const [offline, setOffline] = useState(false);
  const refreshRef = useRef<(force?: boolean) => void>(() => {});
  const refresh = useCallback((force = true) => refreshRef.current(force), []);

  useEffect(() => {
    if (!url || !active) { refreshRef.current = () => {}; return; }
    let disposed = false;
    let inFlight = false;
    let rerun = false;
    let lastStarted = 0;
    let controller: AbortController | null = null;
    const load = async (force = false) => {
      if (disposed) return;
      setOffline(!navigator.onLine);
      if (!navigator.onLine) {
        setState({ url, busy: false, error: "Offline – der angezeigte Stand ist möglicherweise veraltet.", unauthorized: false });
        return;
      }
      if (!force && document.visibilityState !== "visible") return;
      if (inFlight) { if (force) rerun = true; return; }
      if (!force && Date.now() - lastStarted < 1000) return;
      inFlight = true;
      lastStarted = Date.now();
      controller = new AbortController();
      setState(previous => ({ ...previous, url, busy: true }));
      try {
        const data = await fetchJson<T>(url, { signal: controller.signal });
        if (validate && !validate(data)) throw new Error("Ungültige Antwort.");
        if (disposed) return;
        // A mutation completed during this read: do not publish a possibly older result.
        if (!rerun) {
          setSnapshot({ url, data, updatedAt: new Date().toISOString() });
          setState({ url, busy: true, error: null, unauthorized: false });
        }
      } catch (error) {
        if (!disposed) {
          const unauthorized = error instanceof HttpError && error.status === 401;
          if (unauthorized) setSnapshot(null);
          setState({ url, busy: true, error: unauthorized ? "Deine Sitzung ist abgelaufen. Bitte erneut anmelden." : "Aktualisierung fehlgeschlagen. Der angezeigte Stand ist möglicherweise veraltet.", unauthorized });
        }
      } finally {
        inFlight = false;
        if (!disposed) {
          if (rerun) { rerun = false; void load(true); }
          else setState(previous => ({ ...previous, busy: false }));
        }
      }
    };
    const trigger = () => { void load(false); };
    const resume = () => {
      if (document.visibilityState === "visible") { lastStarted = 0; void load(false); }
    };
    const connection = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) { lastStarted = 0; void load(true); }
      else setState(previous => ({ ...previous, url, error: "Offline – der angezeigte Stand ist möglicherweise veraltet." }));
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "kc:refresh") { lastStarted = 0; void load(true); }
    };
    refreshRef.current = force => { void load(force); };
    void load(true);
    const timer = window.setInterval(trigger, intervalMs);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", trigger);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    navigator.serviceWorker?.addEventListener("message", message);
    return () => {
      disposed = true;
      controller?.abort();
      refreshRef.current = () => {};
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", trigger);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, [url, intervalMs, active, validate]);

  return {
    data: snapshot?.url === url ? snapshot.data : null,
    updatedAt: snapshot?.url === url ? snapshot.updatedAt : null,
    loading: state.url === url && state.busy,
    error: state.url === url ? state.error : null,
    unauthorized: state.url === url && state.unauthorized,
    offline, refresh,
  };
}
