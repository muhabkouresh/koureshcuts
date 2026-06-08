import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description: `Datenschutzerklärung von ${siteConfig.name}.`,
  robots: { index: false, follow: false },
};

// Provisional privacy policy. This is a starting template, NOT legal advice —
// have it reviewed and complete the bracketed placeholders before going live.
export default function DatenschutzPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <Link
        href="/"
        className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
      >
        ← Zurück zur Startseite
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        Datenschutzerklärung
      </h1>

      <p className="mt-3 rounded-lg bg-surface px-4 py-3 text-sm text-muted">
        Hinweis: Dies ist eine vorläufige Vorlage und keine Rechtsberatung. Bitte
        vor dem Live-Gang prüfen lassen und die mit [eckigen Klammern]
        markierten Angaben vervollständigen.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-base font-semibold">1. Verantwortlicher</h2>
          <p className="mt-2">
            Verantwortlich für die Datenverarbeitung auf dieser Website ist:
            <br />
            {siteConfig.name}
            <br />
            [Vor- und Nachname des Inhabers]
            <br />
            [Straße und Hausnummer]
            <br />
            [PLZ und Ort]
            <br />
            E-Mail:{" "}
            <a className="underline" href={`mailto:${siteConfig.ownerEmail}`}>
              {siteConfig.ownerEmail}
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">
            2. Verarbeitung bei der Terminbuchung
          </h2>
          <p className="mt-2">
            Wenn du online einen Termin buchst, verarbeiten wir die von dir
            angegebenen Daten: <strong>Name</strong>, <strong>E-Mail-Adresse</strong>{" "}
            sowie eine optionale <strong>Terminnotiz</strong>. Diese Daten nutzen
            wir ausschließlich, um deinen Termin zu verwalten, dir eine
            Bestätigung und ggf. eine Erinnerung zu senden und den Termin
            durchzuführen.
          </p>
          <p className="mt-2">
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung
            vorvertraglicher bzw. vertraglicher Maßnahmen) sowie unser
            berechtigtes Interesse an einer reibungslosen Terminorganisation
            (Art. 6 Abs. 1 lit. f DSGVO).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">3. E-Mail-Versand</h2>
          <p className="mt-2">
            Für den Versand von Bestätigungs- und Erinnerungs-E-Mails nutzen wir
            den Dienstleister <strong>Resend</strong> (Resend, Inc., USA). Dabei
            werden deine E-Mail-Adresse und die Termindaten an diesen Anbieter
            übermittelt, ausschließlich zum Zweck des E-Mail-Versands.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">4. Hosting</h2>
          <p className="mt-2">
            Diese Website wird bei <strong>[Hosting-Anbieter, z. B. Vercel]</strong>{" "}
            gehostet. Beim Aufruf der Seite werden technisch notwendige
            Server-Logdaten (z. B. IP-Adresse, Zeitpunkt des Zugriffs)
            verarbeitet, um den Betrieb und die Sicherheit zu gewährleisten.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">5. Speicherdauer</h2>
          <p className="mt-2">
            Termindaten werden gespeichert, solange dies für die
            Terminabwicklung erforderlich ist und anschließend im Rahmen
            gesetzlicher Aufbewahrungsfristen. Danach werden sie gelöscht.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">6. Deine Rechte</h2>
          <p className="mt-2">
            Du hast das Recht auf Auskunft, Berichtigung, Löschung,
            Einschränkung der Verarbeitung, Datenübertragbarkeit sowie
            Widerspruch. Außerdem kannst du dich bei einer
            Datenschutz-Aufsichtsbehörde beschweren. Wende dich dazu an die oben
            genannte Kontaktadresse.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">7. Keine Zahlungsdaten</h2>
          <p className="mt-2">
            Die Bezahlung erfolgt vor Ort. Über diese Website werden keine
            Zahlungsdaten erhoben oder verarbeitet.
          </p>
        </section>

        <p className="text-xs text-muted">Stand: [Datum eintragen]</p>
      </div>
    </main>
  );
}
