# KoureshCuts — Datum-Bugfix, Mail-Footer, Umsatz-Statistik

## Context
Drei Punkte aus Nutzer-Feedback an der laufenden Buchungs-App
(`C:\Users\muhab\koureshcuts`, Next.js 16 + Prisma 6, Deutsch/EUR):

1. **Datum-Bug (bewiesen):** Ein gesperrter Einzeltag erscheint als „Sa., 06.06.2026 –
   Fr., 05.06.2026" und wird gar nicht blockiert. Ursache: `zonedToUtc(dateStr, 24*60, tz)`
   baut die ungültige Lokalzeit `…T24:00:00`, die zu **00:00 desselben Tages** kollabiert
   (read-only verifiziert: Ergebnis = Tagesanfang statt Folgetag). Damit ist das gespeicherte
   `endDate == startDate`. Dieselbe `24*60`-Konstruktion nutzt auch
   `getAvailability`/`getMonthAvailability` (Tages-/Monatsfenster) → derselbe Off-by-one.
2. **E-Mail:** Den kompletten unteren Footer (Adresse + Telefon) und den Satz „Fragen? Ruf an …"
   entfernen.
3. **Umsatz-Bereich (neu):** Im Admin einen Bereich, der **Umsatz pro Woche und pro Monat** zeigt –
   inkl. einfacher Statistik/Diagramm.

## Fix 1 — Datum/„Ende des Tages" (Root-Cause)
- **Eine zentrale Korrektur** in [time.ts](src/lib/time.ts) → `zonedToUtc`: Minuten ≥ 1440 auf den
  Folgetag normalisieren statt `24:00` zu bauen:
  ```ts
  export function zonedToUtc(dateStr, minutes, tz) {
    const day = addDaysToDateStr(dateStr, Math.floor(minutes / 1440));
    const min = ((minutes % 1440) + 1440) % 1440;
    return fromZonedTime(`${day}T${minutesToHHMM(min)}:00`, tz);
  }
  ```
  Damit ergibt `zonedToUtc(d, 24*60)` korrekt den Folgetag-00:00. Das repariert **automatisch**
  Urlaub (POST/PUT timeoff) **und** die Verfügbarkeits-Fenster — ohne deren Aufrufstellen zu ändern.
  (Slot-Generierung nutzt nur Minuten < 1440, daher unverändert.)
- **Bestehenden, kaputt gespeicherten Urlaubseintrag bereinigen** (das eine 06.06.-Beispiel):
  beim Ausführen per `scripts/clear-appts.ts`-Stil entfernen bzw. neu speichern (User kann den
  Eintrag auch einfach löschen + neu anlegen).
- Verifizieren, dass Einzeltag korrekt als „Sa., 06.06.2026" (ein Datum) angezeigt **und** in der
  Verfügbarkeit geblockt wird; bestehende mehrtägige Sperren enden korrekt am letzten Tag.

## Fix 2 — E-Mail entschlacken
In [email.ts](src/lib/email.ts):
- `layout(...)`: den Footer-Absatz `${siteConfig.name} · ${siteConfig.address} … ${siteConfig.phone}`
  **entfernen** (kein Adress-/Telefon-Block mehr).
- Den Satz „… Fragen? Ruf an: ${siteConfig.phone}." aus **Bestätigungs-** und **Erinnerungs-Mail**
  entfernen (Bestätigung endet nach dem .ics-Hinweis; Erinnerung nach „Bis bald!").

## Fix 3 — Umsatz-Statistik (Admin)
- Neue Server-Aggregation `src/lib/revenue.ts` → `getRevenueStats()`:
  - Query: `appointment` mit `status = COMPLETED`, `startTime >= vor 12 Monaten`,
    `select startTime, service.priceCents`.
  - Buckets in Shop-TZ (Europe/Berlin): **letzte 8 Wochen** (Mo-beginnend) und **letzte 6 Monate**;
    leere Buckets als 0 erzeugen, damit das Diagramm durchgehend ist.
  - Rückgabe: `weeks[]`, `months[]` (je `{label, cents}`), `totalCents`, `thisWeekCents`,
    `thisMonthCents`. Wiederverwenden: `formatInTimeZone`/`de` (date-fns-tz), `dateKey`,
    `addDaysToDateStr` aus [time.ts](src/lib/time.ts).
- [admin/page.tsx](src/app/admin/page.tsx): `getRevenueStats()` mitladen und als `data.revenue`
  durchreichen.
- [AdminDashboard.tsx](src/components/admin/AdminDashboard.tsx): vierter Tab **„Umsatz"** mit einer
  neuen `UmsatzTab`-Komponente:
  - Kennzahl-Karten: **Diese Woche**, **Dieser Monat**, **Gesamt** (mit `priceFull`).
  - **Balkendiagramm pro Woche** (8 Balken) und **pro Monat** (6 Balken) als reine CSS-Bars
    (Höhe relativ zum Maximum) mit Labels + Beträgen — keine zusätzliche Chart-Library.
  - Hinweis im UI: Umsatz = abgeschlossene („erledigte") Termine.

## Kritische Dateien
- [src/lib/time.ts](src/lib/time.ts) — `zonedToUtc`-Normalisierung (Kern-Fix)
- [src/lib/email.ts](src/lib/email.ts) — Footer + „Ruf an"-Sätze entfernen
- neu `src/lib/revenue.ts`; [src/app/admin/page.tsx](src/app/admin/page.tsx);
  [src/components/admin/AdminDashboard.tsx](src/components/admin/AdminDashboard.tsx) — Umsatz-Tab

## Verifikation
- `npm run build` grün.
- **Datum:** Einzeltag sperren → Liste zeigt **ein** Datum (z. B. „Sa., 06.06.2026"); Verfügbarkeit
  für diesen Tag liefert 0 Slots; Mehrtages-Sperre endet am korrekten letzten Tag. Read-only-Check
  `zonedToUtc(d,1440)` == Folgetag-00:00.
- **Verfügbarkeit:** gebuchter Slot an einem Zukunftstag erscheint **nicht** mehr als frei
  (Gegenprobe, da Tagesfenster nun korrekt).
- **E-Mail:** Testbuchung → Mail enthält **keinen** Adress-/Telefon-Footer und **keinen** „Ruf an"-Satz.
- **Umsatz:** zwei erledigte Termine (15 € / 20 €) → „Diese Woche/Monat/Gesamt" und die Wochen-/
  Monatsbalken zeigen die korrekten Summen.
- Beispiel-/Testdaten nach den Tests bereinigen (`scripts/clear-appts.ts`); echte Daten/Settings
  des Nutzers unangetastet lassen.
```
