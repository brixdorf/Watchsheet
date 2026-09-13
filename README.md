<div align="center">

<img src="web/public/logo.svg" alt="Watchsheet logo" width="88" height="88">

# Watchsheet

**A logbook for the football you watch.**

Tick off the matches you saw, rate them if you like, and let a season of it add up.

[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![React](https://img.shields.io/badge/react-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![SQLite](https://img.shields.io/badge/sqlite-built--in-003B57?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)

[Features](#-features) · [How it works](#-how-it-works) · [Getting started](#-getting-started) · [Configuration](#-configuration) · [Deploying](#-deploying)

</div>

<br>

Mark a match watched in one tap. Add a 1–5 rating or a note if you feel like it. Over a season
it adds up to a record of what you actually saw: who, when, how often, and what you thought of
it.

Watchsheet is for people who follow a lot of football across leagues and competitions and want
that record without keeping a spreadsheet. Run it for yourself or for a handful of friends; each
account keeps its own log.

## ✨ Features

- **Feed** — recent results and upcoming fixtures from the teams and competitions you follow.
- **One-tap logging** — mark a match watched; rating and notes are optional.
- **Search** — every match held, not just the ones you follow. Type two teams, a competition or a date.
- **Following** — follow any team or competition. It decides what reaches your feed and never
  marks anything watched for you.
- **History** — everything you have logged, grouped by month.
- **Stats** — per season: matches, minutes and goals per match, watching streaks, your busiest
  day, average rating, most-watched teams and competitions, the most common scoreline, the
  biggest rout and a month-by-month count.
- **Custom matches** — log games the provider doesn't carry, like friendlies or local football.
  Only the account that adds one can see it.
- **Export** — your full log as CSV or JSON, for one season or all time.
- **Passwordless sign-in** — a code by email; sessions last 30 days.
- **Admin screen** — today's provider spend, a sync button, and accounts with their live sessions.
- **Light and dark themes**, with a layout built for phones first.

## 🧭 How it works

Fixtures and scores come from the [Highlightly](https://highlightly.net) football API and are
synced into a local SQLite database. Browsing, searching, logging and stats are all local
queries, so no user action ever calls the provider.

The sync is built around the free tier's **100 requests a day**:

- Every request is counted before it is made, and work stops cleanly when the day's budget runs out.
- Each run resumes where the last one stopped.
- What people follow comes first. A competition someone follows is refreshed several times as
  often as one nobody does, and one a followed team plays in about twice as often.

A new install fetches the league catalog, then each competition's season, followed and popular
ones first. Teams come from those fixtures at no extra cost, so fixtures show up on the first
day.

## 🚀 Getting started

**Requirements:** Node 22.13 or newer and a [Highlightly](https://highlightly.net) API key.
A [Resend](https://resend.com) key is optional, for sending sign-in codes by email.

```bash
npm install
cp .env.example .env    # add HIGHLIGHTLY_API_KEY
npm run sync            # first sync: league catalog, then fixtures (about 70 requests)
npm run dev             # API on :3000, app on http://localhost:5173
```

Skip `npm run sync` and the server starts the first sync by itself a few seconds after it boots,
then continues at up to 25 requests an hour until every competition has its fixtures.

> [!TIP]
> Without a Resend key, sign-in codes are printed to the server output and shown on the sign-in
> screen, so the whole flow works locally with no mail setup.

## 🔧 Configuration

Everything is set through environment variables. `.env.example` lists them all with defaults.

| Variable | What it's for |
| --- | --- |
| `SESSION_SECRET` | Signs session cookies. Set a long random value in production. |
| `HIGHLIGHTLY_API_KEY` | Fixture data. Without it the sync stays idle. |
| `RESEND_API_KEY`, `MAIL_FROM` | Send sign-in codes by email. The sender must be on a domain verified in your Resend account. |
| `MAIL_REPLY_TO` | Optional. Where replies to a sign-in email go. |
| `ADMIN_EMAILS` | Comma-separated addresses that can open the admin screen. Nobody can until it is set. |
| `DATABASE_PATH` | Where the SQLite file lives. Default `./data/watchsheet.db`. |
| `TRUST_PROXY_HOPS` | Reverse proxies in front of the app, so rate limits see the real client address. |
| `HIGHLIGHTLY_DAILY_BUDGET`, `SYNC_SLICE` | Requests allowed per day, and spent per hourly run. |

## 🧰 Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web dev server together |
| `npm run build` · `npm start` | Production build, then serve the API and the app on one port |
| `npm run sync` | The scheduled run by hand (`-- --max=10` caps it) |
| `npm run seed` | Resolve the starting teams and competitions only, searching for each team |
| `npm run sync:status` | Today's spend, seed progress and fixture counts |
| `npm test` | Test suite, on a throwaway database with a stand-in provider and no real mail |

## 📦 Deploying

`npm run build` then `npm start` serves the API and the app together on `PORT` (default 3000).

- **Persistent storage.** Put `DATABASE_PATH` on a persistent volume. Mount the directory, not
  just the file, because SQLite keeps its `-wal` and `-shm` files beside the database.
- **One instance.** The database and the sync schedule both live in the process.
- **HTTPS.** Session cookies are marked secure in production.
- **Proxy count.** Set `TRUST_PROXY_HOPS` to match the proxies in front of the app.

A fresh deploy fills itself: the first sync starts on boot, with no manual step.

<br>

<div align="center">
<sub>Fixtures and scores from <a href="https://highlightly.net">Highlightly</a>.</sub>
</div>
