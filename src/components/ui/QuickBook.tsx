"use client";

// The "next free appointment" hero teaser: one tap hands service, day, and
// time straight to the booking flow (which listens for the event) and
// scrolls down to it — from landing to the details form in one gesture.
export default function QuickBook({
  serviceId,
  start,
  label,
}: {
  serviceId: string;
  start: string;
  label: string;
}) {
  function pick() {
    window.dispatchEvent(
      new CustomEvent("kc:quickbook", { detail: { serviceId, start } }),
    );
    document
      .getElementById("book")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={pick}
      className="animate-fade-up delay-3 mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/90 px-4 py-2 text-sm font-medium text-emerald-800 backdrop-blur-sm transition-transform hover:scale-[1.02] hover:border-emerald-300"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      Nächster freier Termin: <strong>{label}</strong>
      <span aria-hidden className="font-semibold">
        →
      </span>
    </button>
  );
}
