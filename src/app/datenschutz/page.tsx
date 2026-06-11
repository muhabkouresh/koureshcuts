import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description: `Datenschutzerklärung von ${siteConfig.name}.`,
  robots: { index: false, follow: false },
};

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

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-base font-semibold">1. Verarbeitete Daten</h2>
          <p className="mt-2">
            Bei Nutzung dieser Buchungswebsite können insbesondere folgende
            Daten verarbeitet werden:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Kontakt- und Buchungsdaten (z. B. Name, E-Mail-Adresse,
              Telefonnummer, gewünschter Termin)
            </li>
            <li>
              Technische Daten (z. B. IP-Adresse, Datum und Uhrzeit des
              Zugriffs)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold">2. Zweck der Verarbeitung</h2>
          <p className="mt-2">Die Datenverarbeitung erfolgt zur:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Bearbeitung von Terminanfragen und Buchungen</li>
            <li>Kommunikation mit Kundinnen und Kunden</li>
            <li>Erfüllung vertraglicher und vorvertraglicher Pflichten</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold">3. Rechtsgrundlagen</h2>
          <p className="mt-2">
            Rechtsgrundlagen der Verarbeitung sind insbesondere Art. 6 Abs. 1
            lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO
            (berechtigtes Interesse).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">4. Speicherdauer</h2>
          <p className="mt-2">
            Personenbezogene Daten werden nur so lange gespeichert, wie es für
            die jeweiligen Zwecke erforderlich ist oder gesetzliche
            Aufbewahrungspflichten bestehen.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">
            5. Rechte der betroffenen Personen
          </h2>
          <p className="mt-2">
            Betroffene Personen haben insbesondere folgende Rechte:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
            <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
            <li>Recht auf Löschung (Art. 17 DSGVO)</li>
            <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
            <li>Recht auf Widerspruch (Art. 21 DSGVO)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold">
            6. Einsatz von Dienstleistern / Plattform
          </h2>
          <p className="mt-2">
            Diese Buchungswebsite wird über einen technischen Dienstleister
            betrieben. Der Dienstleister stellt lediglich die Plattform bereit
            und verarbeitet Daten im Auftrag des Seitenbetreibers. Der
            Seitenbetreiber bleibt verantwortlich für die Inhalte und
            Rechtstexte dieser Seite.
          </p>
        </section>
      </div>
    </main>
  );
}
