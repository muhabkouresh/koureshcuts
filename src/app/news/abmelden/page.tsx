import { Suspense } from "react";
import { siteConfig } from "@/config/site";
import UnsubscribeForm from "./UnsubscribeForm";

export const metadata = {
  title: `Abmelden — ${siteConfig.name}`,
  robots: { index: false },
};

// Landing page of the unsubscribe link in broadcast emails. The actual
// opt-out happens via a confirm button (POST) so link scanners can't
// unsubscribe anyone by merely fetching the URL.
export default function UnsubscribePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-2xl border border-line bg-background p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </h1>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          Neuigkeiten abbestellen
        </h2>
        <p className="mt-2 text-sm text-muted">
          Du erhältst dann keine Rundmails (Neuigkeiten, Ankündigungen) mehr
          von uns. Terminbestätigungen und -erinnerungen bekommst du natürlich
          weiterhin.
        </p>
        <Suspense fallback={null}>
          <UnsubscribeForm />
        </Suspense>
      </div>
    </main>
  );
}
