import { siteConfig } from "@/config/site";
import RequestLinkForm from "./RequestLinkForm";

export const metadata = {
  title: `Meine Termine — ${siteConfig.name}`,
  robots: { index: false },
};

// Entry point for customers: enter your email, get a magic link with all
// your appointments. No account needed.
export default function MyAppointmentsPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-2xl border border-line bg-background p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </h1>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          Meine Termine
        </h2>
        <p className="mt-2 text-sm text-muted">
          Gib die E-Mail-Adresse ein, mit der du gebucht hast. Wir senden dir
          einen Link, mit dem du alle deine Termine sehen, verschieben oder
          absagen kannst.
        </p>
        <RequestLinkForm />
      </div>
    </main>
  );
}
