# Watchsheet

A private logbook for football. One tap to mark a match watched — notes and a 1–5 rating
only if you feel like it. Follow teams and competitions, add custom matches for anything
the data provider doesn't carry, and take the whole history with you as JSON or CSV.

Multi-user, session-based sign-in by email code. Fixtures come from
[Highlightly](https://highlightly.net) and are synced into local SQLite on a schedule, so
nothing you do in the app ever calls the provider.

## Running it

```bash
npm install
cp .env.example .env        # then add HIGHLIGHTLY_API_KEY
npm run dev                 # API on :3000, Vite on :5173
```

Open http://localhost:5173. First run has an empty catalog — see **Seeding** below.

For production:

```bash
npm run build               # builds web/dist
npm start                   # Express serves the API and the built app on :3000
```

Requires Node 22 or newer: the database layer uses the built-in `node:sqlite` module, so
there is no native build step and no compiler needed.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web dev server together |
| `npm run build` / `npm start` | production build, then serve |
| `npm run seed` | resolve the seed list against the provider (resumable) |
| `npm run sync` | refresh recent scores, then advance the season rotation |
| `npm run sync -- --max=10` | cap a run at ten requests |
| `npm run sync -- --season=2025` | rotate a past season instead of the current one |
| `npm run sync:status` | today's spend, seed progress, fixture counts |
| `npm run migrate` | apply the schema (also runs automatically on boot) |

`Data & sync` in the account menu shows the same status inside the app.

## The request budget

The free tier allows **100 requests a day**, which is the single biggest constraint on the
design. Three things follow from it:

1. **No user action ever reaches the provider.** Search, feeds, history and stats are all
   SQLite queries. Only the jobs under `server/sync/` hold a network client, and nothing
   outside that directory may import it.
2. **Every request is counted before it is made** (`server/sync/budget.js`), against a
   configurable budget that sits below the real cap — `HIGHLIGHTLY_DAILY_BUDGET`, default
   85. The provider's own `x-ratelimit-requests-remaining` header is recorded too, and
   whichever number is lower wins, so a restart or a second consumer of the key cannot
   cause an overspend.
3. **Running out is a normal outcome, not an error.** Every job commits progress
   incrementally and stops cleanly when the budget is gone. Re-running resumes where it
   left off.

## How syncing works

`/matches` accepts either a single calendar date — which returns every league on earth,
around 920 rows and ten pages for one day — or `leagueId` + `season`, which returns one
competition's entire season. The second form is dramatically cheaper, so the sync runs in
two lanes:

- **Rotation (bulk).** Each resolved competition is re-pulled in full, least recently
  synced first, one page at a time, with the cursor stored on the competition row. A full
  pass over ~36 competitions costs roughly 100–150 requests, so it completes over about two
  days and then starts again. Fixture lists change slowly; this is fine.
- **Refresh (scores).** Matches already held that kicked off recently and are not yet final,
  queried as `leagueId` + `date`. The set of pairs comes from local data, so it only spends
  requests where fixtures actually exist — typically a handful, even on a busy weekend.

Refresh runs first each tick because it is small and time-sensitive. A cron fires hourly and
spends at most `SYNC_SLICE` requests, so the schedule cannot outrun the daily budget however
often it fires.

## Seeding

`npm run seed` resolves the requested teams and competitions against the provider. It runs
automatically in the background too, and takes priority over fixture syncing until it
finishes, since the rotation has nothing to work with until competitions resolve.

The league catalog (~900 entries) is mirrored into `provider_leagues` page by page, then
matched locally. Caching it means a budget stop resumes at an offset rather than restarting,
and re-matching after an alias change costs nothing at all. Teams then resolve one lookup
each. Expect 55–65 requests in total.

Matching is deliberately strict — exact name, then alias, then a whole-word prefix tier that
is rejected outright when two candidates fit equally well. A wrong match silently attaches a
follow to the wrong club, which is worse than not resolving at all. A seed's own name always
outranks an alias, which is what separates `UEFA Super Cup` from the 57 national
competitions literally named "Super Cup"; the German and Indian entries that share the name
`Super Cup` are told apart by a country hint on the seed row.

Of the requested list, 36 of 42 competitions and 43 of 46 teams resolve. The rest are not
carried by the provider and are simply absent from the catalog — **Add custom match** covers
them, which is the intended route for charity matches, Soccer Aid, the Durand Cup and the
lower Nations League tiers.

## Email codes

Sign-in is a six-digit code, hashed at rest, valid for ten minutes, with a 30-second resend
cooldown and a five-attempt ceiling — all enforced server-side.

Delivery is a swappable seam. `MAIL_PROVIDER=console` (the default) prints the code to the
server output and, with `OTP_DEV_ECHO=true`, shows it on the verify screen, so the flow is
genuinely usable today. The code itself is real either way; only delivery is local.

`server/lib/email/resend.js` is the live path, written against the intended deployment:
the domain stays on **another mail host**, which keeps the MX records and receives replies, while
**Resend** does the outbound sending. To switch it on:

1. Add the domain in Resend and publish the DKIM CNAME records it gives you.
2. Add Resend to the domain's SPF record, keeping another mail host's include intact —
   `v=spf1 include:another mail host.com include:amazonses.com ~all` (confirm the exact include in the
   Resend dashboard).
3. Leave the MX records pointing at another mail host; inbound mail is unaffected.
4. Set `RESEND_API_KEY` and `MAIL_FROM`, then `MAIL_PROVIDER=resend`.

Until then the module reports itself unconfigured and the factory falls back to console
delivery rather than failing sign-in.

## Layout

```
server/
  config.js          env parsing, one place
  db/                schema.sql, connection, migrate, the seed lists
  lib/               session, otp, email providers, name matching, shared match reads
  routes/            auth, catalog, matches, logs, stats, export, admin
  sync/              client, budget, seed, fixtures, cron, cli
web/
  src/App.jsx        shell: session, tab, season, and the data each screen needs
  src/components/    the five screens, the match card, the modals
  src/lib/           format and colour helpers, GSAP choreography, API client
```

Two rules live in `server/lib/present.js` so no route can forget them: a custom match is
visible only to the user who created it, and a match always carries the requesting user's
own watch log. Watch logs key off the local `matches.id`, which is stable across re-syncs,
so a score update from the provider can never orphan what a user recorded.

Anything calendar- or clock-shaped — late kick-offs, matches per day, month buckets, export
timestamps — is computed in the viewer's timezone, sent from the client. Otherwise a 21:00
kick-off would count as late or not depending on where the server happens to run.

## Origin

The UI is a port of a Claude Design canvas, and the palette, type, spacing and GSAP entrance
choreography are carried over unchanged. Two things differ, both because real data now
exists: crests render as images with the coloured monogram as a fallback rather than always
drawing the monogram, and logs, follows and custom matches live on the server, leaving only
the theme on the device.

The animation helpers keep the canvas's three safety nets verbatim — settle before every
run, only hide-then-reveal inside a `requestAnimationFrame` while the document is visible,
and a timeout that forces the settled state. Together they mean the worst failure mode is
"no animation" rather than "invisible content".
