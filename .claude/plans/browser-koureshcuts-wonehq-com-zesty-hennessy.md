# KoureshCuts — Politur, Bordeaux-Akzent & Admin-Erweiterungen

## Context
Die Buchungs-App (Next.js 16 + Prisma 6, Deutsch/EUR, `C:\Users\muhab\koureshcuts`)
ist funktional fertig. Diese Runde adressiert konkretes Nutzer-Feedback:
1. **Freie Tage / Urlaub** müssen klar **einsehbar und bearbeitbar** sein (aktuell nur
   löschbar, Liste wenig prominent).
2. Gesamtes UI **schöner & mit dezenter Farbe** gestalten — Akzent **Bordeaux/Rot**
   passend zum Logo, auf **Admin + Kundenseite**.
3. Gewünschte Ergänzungen: Urlaub im Kalender markieren, Mini-Übersicht im Admin,
   Kunden-Storno-Link in der E-Mail, **anpassbare Terminerinnerungen**.

Der grüne „Service auswählen"-Button der Kundenseite bleibt (wie im Original).

## Design: Bordeaux-Akzent (dezent)
- In [globals.css](src/app/globals.css) neue Theme-Tokens ergänzen:
  `--brand` (~`#8a1f2b`), `--brand-700` (Hover, dunkler), `--brand-soft` (~`#f7ecee`,
  helle Tönung), als `--color-brand` / `--color-brand-soft` etc. im `@theme inline`.
- **Dezenter Einsatz** (nicht überladen): aktive Kalendertage & Auswahl-States,
  Zähler-Badges, Fokus-/Hover-Ringe, kleine Überschriften-Akzente, aktive Tab-Pille,
  Stat-Zahlen. Primär-Buttons bleiben überwiegend `foreground` (schwarz) für Kontrast;
  Storno/__Gefahr__ bleibt rot.
- **Feinschliff** (Admin + Kunde): einheitliche `rounded-2xl`-Karten, weichere Schatten,
  konsistente Abstände/Typografie, klarere Empty-States, Hover-Transitions. Betroffen:
  [page.tsx](src/app/page.tsx), [BookingFlow.tsx](src/components/booking/BookingFlow.tsx),
  [AdminDashboard.tsx](src/components/admin/AdminDashboard.tsx),
  [DatePicker.tsx](src/components/admin/DatePicker.tsx). Service-Akzentbalken auf
  Brand-Töne abstimmen.

## Freie Tage / Urlaub — einsehbar + bearbeiten
- Karte immer sichtbar mit **Empty-State** („Noch keine freien Tage eingetragen.").
- Pro Eintrag: schön formatierter Zeitraum (Einzeltag vs. „von – bis"), Grund, plus
  **Bearbeiten** und **Entfernen**. „Bearbeiten" lädt den Eintrag ins Formular
  (Von/Bis/Grund) und speichert per Update.
- Neuer Endpunkt **`PUT /api/admin/timeoff/[id]`** in
  [timeoff/[id]/route.ts](src/app/api/admin/timeoff/[id]/route.ts) — Auth + `timeOffSchema`
  (bereits vorhanden in [validation.ts](src/lib/validation.ts)) wiederverwenden, Datums-
  konvertierung wie im POST (`zonedToUtc`, Ende = Folge-Mitternacht).

## Urlaub/geschlossene Tage im Admin-Kalender markieren
- `timeOff` + `hours` an `TermineTab` durchreichen ([admin/page.tsx](src/app/admin/page.tsx)
  liefert beides bereits). Pro Tag berechnen: geschlossen (Wochentag `isClosed`) oder
  gesperrt (von einem TimeOff-Bereich abgedeckt) → dezente Markierung (z. B. „frei"/„zu"
  Punkt/Label, gedämpfter Hintergrund). Im Tagespanel bei gesperrtem Tag Hinweis
  „Gesperrt (Urlaub)".

## Mini-Übersicht (Admin, oben im Termine-Tab)
- Kompakte Statistikkarten aus den vorhandenen `appointments` (clientseitig):
  „Heute: X Termine", „Diese Woche: Y", „Nächster Termin: <Datum/Zeit>",
  evtl. offene/bestätigte Zähler. Brand-Akzent für die Zahlen.

## Kunden-Storno-Link (E-Mail)
- **Ohne Schema-Änderung**: signierter Token per HMAC. Neu `src/lib/token.ts` →
  `cancelToken(id)` = base64url(HMAC-SHA256(id, `SESSION_SECRET`)) + `verifyCancel(id, t)`.
- E-Mail ([email.ts](src/lib/email.ts)) erhält Link
  `${NEXT_PUBLIC_SITE_URL}/termin/absagen/{id}?t={token}` in Bestätigung + Erinnerung.
- Öffentliche Seite `src/app/termin/absagen/[id]/page.tsx` (zeigt Termin, Token-geprüft)
  mit Bestätigen-Button → `POST /api/appointments/[id]/cancel` (Token-geprüft) setzt
  Status `CANCELLED` (gibt den Slot frei). Ungültiger/abgelaufener Token → freundliche
  Fehlermeldung.

## Anpassbare Terminerinnerungen
- `Settings`-Modell ([schema.prisma](prisma/schema.prisma)) erweitern:
  `reminderEnabled Boolean @default(true)`, `reminderLeadHours Int @default(24)` →
  `prisma db push` + Seed-Defaults ([seed.ts](prisma/seed.ts), [settings.ts](src/lib/settings.ts)).
- `settingsSchema` + `PUT /api/admin/settings` verallgemeinern: optionale Felder
  (`bookingWindowDays?`, `reminderEnabled?`, `reminderLeadHours?`) — nur Übergebenes wird
  aktualisiert.
- Cron [reminders/route.ts](src/app/api/cron/reminders/route.ts): wenn `!reminderEnabled`
  → nichts senden; Fenster = `now + reminderLeadHours` (statt fix 24h). `reminderSentAt`
  bleibt der Sende-Marker. [vercel.json](vercel.json) Cron auf **stündlich** stellen, damit
  kleinere Vorlaufzeiten greifen (Hinweis: Frequenz ggf. je nach Vercel-Plan anpassen).
- Admin-UI: Karte **„Erinnerungen"** (Verfügbarkeit-Tab): Schalter An/Aus +
  Auswahl Vorlauf (z. B. 2 / 6 / 12 / 24 / 48 Std.) → speichert via Settings-PUT.

## Kritische Dateien
- Styling/Tokens: [globals.css](src/app/globals.css)
- Admin-UI (Großteil): [AdminDashboard.tsx](src/components/admin/AdminDashboard.tsx),
  [DatePicker.tsx](src/components/admin/DatePicker.tsx), [admin/page.tsx](src/app/admin/page.tsx)
- Kundenseite: [page.tsx](src/app/page.tsx), [BookingFlow.tsx](src/components/booking/BookingFlow.tsx)
- Backend: [timeoff/[id]/route.ts](src/app/api/admin/timeoff/[id]/route.ts) (PUT),
  [settings/route.ts](src/app/api/admin/settings/route.ts), [reminders/route.ts](src/app/api/cron/reminders/route.ts),
  neu `api/appointments/[id]/cancel/route.ts`, neu `termin/absagen/[id]/page.tsx`,
  neu `src/lib/token.ts`, [email.ts](src/lib/email.ts), [settings.ts](src/lib/settings.ts),
  [schema.prisma](prisma/schema.prisma), [seed.ts](prisma/seed.ts), [validation.ts](src/lib/validation.ts)

## Verifikation
- `npm run build` (Typecheck) grün; Dev-Server-Smoke:
  - Urlaub: anlegen, **bearbeiten** (PUT), entfernen; gesperrte/geschlossene Tage im
    Admin-Kalender sichtbar; an gesperrtem Tag keine Kunden-Slots.
  - Mini-Übersicht zeigt korrekte Zahlen (Testbuchung anlegen → „Heute" steigt).
  - Storno: Testbuchung → Bestätigungsmail enthält Storno-Link; Link öffnet Seite,
    Bestätigen storniert (Status CANCELLED, Slot wieder frei); falscher Token → abgelehnt.
  - Erinnerungen: Aus → Cron sendet 0; Vorlauf 48h → Termin in ~30h wird erfasst;
    `reminderSentAt` wird gesetzt (kein Doppelversand).
  - Optischer Check Admin + Kundenseite (Mobil + Desktop), dezenter Bordeaux-Akzent.
- Testdaten nach den Smoke-Tests entfernen (`scripts/clear-appts.ts`).

## Hinweise
- Echte E-Mails laufen über Resend (Key in `.env`, Test-Absender `onboarding@resend.dev`
  → aktuell nur an die eigene Adresse). Für echte Kunden später Domain verifizieren.
- Eigene Öffnungszeiten/Settings des Nutzers in der DB **nicht** durch Seed überschreiben.
