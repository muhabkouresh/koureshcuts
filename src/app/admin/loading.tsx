// Instant skeleton shown while the admin page runs its (heavy) server queries.
// Without this, Next renders nothing until all DB calls resolve — a blank screen
// on a Neon cold start. The skeleton makes the dashboard feel like it opens
// immediately.
export default function AdminLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-page px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 rounded-lg bg-line" />
          <div className="h-9 w-9 rounded-full bg-line" />
        </div>

        {/* Tab row */}
        <div className="mt-6 flex gap-2 overflow-hidden">
          {[64, 72, 56, 80].map((w, i) => (
            <div
              key={i}
              className="h-9 rounded-full bg-line"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* Date strip */}
        <div className="mt-6 flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 flex-1 rounded-xl bg-line" />
          ))}
        </div>

        {/* Appointment cards */}
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-background p-4 shadow-sm ring-1 ring-line"
            >
              <div className="h-5 w-1/3 rounded bg-line" />
              <div className="mt-2 h-4 w-1/2 rounded bg-line" />
              <div className="mt-3 flex gap-2">
                <div className="h-8 w-24 rounded-full bg-line" />
                <div className="h-8 w-28 rounded-full bg-line" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
