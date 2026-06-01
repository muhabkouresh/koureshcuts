# KoureshCuts

A clean, minimal booking website for a barbershop, built with Next.js. Customers
book a service and time slot as guests; the shop manages everything from a
password-protected admin dashboard. Self-owned booking backend — no third-party
scheduler.

## Features

- **Single-page landing** — hero, services & prices, and an inline booking flow.
- **Custom booking engine** — single-chair availability computed from weekly
  hours, days off, existing bookings, lead time, and a booking window.
- **Guest checkout** — name, email, phone. No accounts.
- **Email confirmations** (Resend) with an attached `.ics` file and an
  "Add to Google Calendar" link.
- **Day-before reminders** via a daily Vercel Cron job.
- **Admin dashboard** (`/admin`) — view/cancel/complete bookings, edit weekly
  hours, and add days off / vacations.
- **Pay in shop** — no online payments.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Prisma 6 · SQLite (dev) / Postgres (prod) · Resend · iron-session · zod.

## Getting started (local)

```bash
npm install
npm run db:push     # create the SQLite database from the schema
npm run db:seed     # add placeholder services + opening hours
npm run dev         # http://localhost:3000
```

Copy `.env.example` to `.env` and adjust values. In dev you can leave
`RESEND_API_KEY` empty — confirmation/reminder emails are printed to the
terminal instead of being sent.

- Customer site: `http://localhost:3000`
- Admin dashboard: `http://localhost:3000/admin` (password = `ADMIN_PASSWORD`)

## Editing your business details

All placeholder content lives in two places:

- `src/config/site.ts` — name, tagline, phone, address, **timezone**, socials,
  booking window, and lead time.
- `prisma/seed.ts` — the list of services (name, price, duration) and default
  weekly hours. Re-run `npm run db:seed` after editing (services only seed when
  the table is empty; clear it first to reseed, or edit in the admin / DB).

Opening hours and days off can also be managed live from the admin dashboard.

## Day-before reminders

`GET /api/cron/reminders` emails everyone with an appointment in the next 24h
who hasn't been reminded. It is protected by `CRON_SECRET`. `vercel.json`
schedules it daily at 13:00 UTC. To test locally:

```bash
curl http://localhost:3000/api/cron/reminders -H "Authorization: Bearer dev-cron-secret-change-me"
```

## Deploying to Vercel + Neon Postgres

1. Create a Postgres database on [Neon](https://neon.tech) and copy its
   connection string.
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to
   `provider = "postgresql"`.
3. Set the environment variables from `.env.example` in your Vercel project
   (`DATABASE_URL` = the Neon URL, plus `ADMIN_PASSWORD`, `SESSION_SECRET`,
   `RESEND_API_KEY`, `FROM_EMAIL`, `CRON_SECRET`).
4. Run migrations against Neon: `npx prisma db push` (or set up
   `prisma migrate`), then `npm run db:seed`.
5. Deploy. Vercel reads `vercel.json` and registers the reminder cron, sending
   `Authorization: Bearer $CRON_SECRET` automatically.

## Scripts

| Script              | Purpose                            |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start the dev server               |
| `npm run build`     | Production build                   |
| `npm run db:push`   | Sync the schema to the database    |
| `npm run db:seed`   | Seed placeholder services + hours  |
| `npm run db:studio` | Open Prisma Studio to inspect data |
