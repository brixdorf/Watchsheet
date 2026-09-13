# Watchsheet

A logbook for the football you watch.

Mark a match watched in one tap. Add a 1–5 rating or a note if you feel like it. Over a season
it adds up to a record of what you actually saw: who, when, how often, and what you thought
of it.

It is for people who follow a lot of football across leagues and competitions and want that
record without keeping a spreadsheet. Run it for yourself, or for a handful of friends. Each
account keeps its own log.

## What it does

- **Feed.** Recent results and upcoming fixtures for the teams and competitions you follow.
- **Logging.** One tap marks a match watched. Rating and notes are optional.
- **Search.** Every match held, not just the ones you follow, filterable by competition.
- **Following.** Follow any team or competition in the catalog. Following decides what reaches
  your feed, and never marks anything watched on your behalf.
- **History.** Everything you have logged, grouped by month.
- **Stats.** For each season:
  - matches, minutes and goals per match
  - watching streaks and your busiest day
  - average rating
  - your most-watched teams and competitions
  - the most common scoreline and the biggest rout
  - a month-by-month count
- **Custom matches.** Log games the data provider doesn't carry, such as friendlies, charity
  matches or local football. Only the account that adds one can see it.
- **Export.** Your full log as CSV or JSON, for one season or all time.
- **Sign-in by email code.** No passwords. A session lasts 30 days.
- **Admin screen.**
  - Today's provider spend.
  - A button to run the fixture sync by hand.
  - Accounts and their live sessions.
- **Light and dark themes**, and a layout built for phones first.

## How it works

Fixtures and scores come from the [Highlightly](https://highlightly.net) football API. They
are synced into a local SQLite database on an hourly schedule, so browsing, searching,
logging and stats are all local queries and no user action ever calls the provider.

The sync is built around the free tier's 100 requests a day:
- Every request is counted before it is made.
- Work stops cleanly when the day's budget runs out.
- The next run resumes where the last one stopped.

On a new install the sync fetches the league catalog, then each competition's season, with
followed and popular ones first. Teams are taken from those fixtures at no extra cost, and
only teams no fixture mentions are searched for, so the first day's requests are enough for
fixtures to show up.

Stack: Node (the built-in `node:sqlite`, so there is no native build step), Express 5, React 19
and Vite 8.

## Getting started

Requirements:
- Node 22.13 or newer.
- A [Highlightly](https://highlightly.net) API key.
- Optionally, a [Resend](https://resend.com) key for sending sign-in codes by email.

```bash
npm install
cp .env.example .env    # add HIGHLIGHTLY_API_KEY
npm run sync            # first sync: league catalog, then fixtures (about 70 requests)
npm run dev             # API on :3000, app on http://localhost:5173
```

Without a Resend key, sign-in codes are printed to the server output and shown on the
sign-in screen, so the whole flow works locally with no mail setup.

Skip that step and the server starts the first sync by itself a few seconds after it boots,
then continues at up to 25 requests an hour until every competition has its fixtures. A new
deploy fills itself the same way.

## Configuration

Everything is set through environment variables; `.env.example` lists them all with
defaults.

| Variable | What it's for |
| --- | --- |
| `SESSION_SECRET` | Signs session cookies. Set a long random value in production. |
| `HIGHLIGHTLY_API_KEY` | Fixture data. Without it the sync stays idle. |
| `RESEND_API_KEY`, `MAIL_FROM` | Send sign-in codes by email. The sender must be on a domain verified in your Resend account. Without a key, codes are only printed locally. |
| `MAIL_REPLY_TO` | Optional. Where replies to a sign-in email go. |
| `ADMIN_EMAILS` | Comma-separated addresses that can open the admin screen. Nobody can until it is set. |
| `DATABASE_PATH` | Where the SQLite file lives. Default `./data/watchsheet.db`. |
| `TRUST_PROXY_HOPS` | Number of reverse proxies in front of the app, so rate limits see the real client address. |
| `HIGHLIGHTLY_DAILY_BUDGET`, `SYNC_SLICE` | Requests allowed per day, and spent per hourly run. |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web dev server together |
| `npm run build` / `npm start` | Production build, then serve the API and the built app on one port |
| `npm run seed` | Resolve the starting teams and competitions only, searching for each team (resumable) |
| `npm run sync` | The scheduled run: catalog and fixtures on a new install, then recent scores and the season rotation (`-- --max=10` caps a run) |
| `npm run sync:status` | Today's spend, seed progress, fixture counts |
| `npm test` | Test suite. Uses a throwaway database, a stand-in provider and no real mail |

## Deploying

`npm run build` then `npm start` serves the API and the app together, on `PORT` (default
3000). Four requirements:

- **Persistent storage.** Put `DATABASE_PATH` on a persistent volume. Mount the directory,
  not just the file, because SQLite keeps its `-wal` and `-shm` files beside the database.
- **One instance.** The database and the sync schedule both live in the process.
- **HTTPS.** Session cookies are marked secure in production.
- **Proxy count.** Set `TRUST_PROXY_HOPS` to match the proxies in front of the app.
