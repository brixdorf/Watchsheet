# Watchsheet

A private logbook for football. One tap to mark a match watched — notes and a 1–5 rating
only if you feel like it. Follow teams and competitions, add custom matches for anything
the data provider doesn't carry, and take the whole history with you as JSON or CSV.

Multi-user, session-based sign-in by email code; a session lasts 30 days and then needs a
fresh code. Fixtures come from
[Highlightly](https://highlightly.net) and are synced into local SQLite on a schedule, so
nothing you do in the app ever calls the provider.

## Running it

```bash
npm install
cp .env.example .env        # then add HIGHLIGHTLY_API_KEY
npm run dev                 # API on :3000, Vite on :5173
```

Open http://localhost:5173. First run has an empty catalog — see **The catalog** below.

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

The **Admin** screen shows the same status inside the app, and can run any of the sync
commands without a shell on the server.

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

## The catalog

`npm run seed` resolves a starting list of teams and competitions against the provider. It
runs automatically in the background too, and takes priority over fixture syncing until it
finishes, since the rotation has nothing to work with until competitions resolve.

The league catalog (~900 entries) is mirrored into `provider_leagues` page by page, then
matched locally. Caching it means a budget stop resumes at an offset instead of restarting,
and re-matching after an alias change costs nothing at all. Teams then resolve one lookup
each. Expect 55–65 requests in total.

Matching is deliberately strict — exact name, then alias, then a whole-word prefix tier that
is rejected outright when two candidates fit equally well. A wrong match silently attaches a
follow to the wrong club, which is worse than not resolving at all. A seed name always
outranks an alias, which is what separates `UEFA Super Cup` from the 57 national competitions
literally named "Super Cup"; the German and Indian entries that share the name `Super Cup`
are told apart by a country hint on the seed row.

**That list is a starting menu, not the catalog.** Every team and competition the provider
resolves — including the several hundred picked up from fixtures — can be followed by any
user, at any time, from the Following tab. Nothing is auto-followed: a new account ends
sign-up by choosing for itself, and following a side only decides whose fixtures reach the
feed. It never marks anything watched.

Ordering is a popularity rank stored on the row and re-applied on every boot from the ordered
lists in `server/db/popularity.js`, so the names most people are looking for lead both the
catalog and the sign-up picker. Changing that order is a one-file edit.

Six of the requested competitions and three of the teams are not carried by the provider at
all and are simply absent — **Add custom match** covers them, which is the intended route for
charity matches, Soccer Aid, the Durand Cup and the lower Nations League tiers.

## Email codes

Sign-in is a six-digit code, hashed at rest, valid for ten minutes, with a 30-second resend
cooldown and a five-attempt ceiling — all enforced server-side.

Delivery is a swappable seam. `MAIL_PROVIDER=console` (the default) prints the code to the
server output and, with `OTP_DEV_ECHO=true`, shows it on the verify screen, so the flow is
genuinely usable without a provider. The code itself is real either way; only delivery is
local.

`server/lib/email/resend.js` is the live path, using the `resend` SDK. It is written against
the intended deployment: the domain stays on **another mail host**, which keeps the MX records and
receives replies, while **Resend** does the outbound sending. Because the sender is a
no-reply address, `MAIL_REPLY_TO` points replies back at the another mail host mailbox — otherwise a reply
to a sign-in code would go nowhere.

To switch it on:

1. Add the domain at [resend.com/domains](https://resend.com/domains) and publish **exactly**
   the DKIM and SPF records it prints. Merge its SPF include into the existing record rather
   than replacing it — one TXT record holding both another mail host and Resend, never two.
2. Leave the MX records pointing at another mail host. Inbound mail is unaffected; MX and sending
   authentication are independent.
3. If the DNS is behind Cloudflare, set those records to **DNS only**. Proxying them breaks
   verification.
4. Set `RESEND_API_KEY`, `MAIL_FROM` (an address on the verified domain) and `MAIL_REPLY_TO`,
   then `MAIL_PROVIDER=resend`.

Until the key and sender are both set the module reports itself unconfigured and the factory
falls back to console delivery rather than failing sign-in. Two details worth knowing: each
issued code carries an idempotency key (`signin-code/<row id>`), so a retry can never deliver
a second copy of the same code; and the account rate limit of ten requests a second is
absorbed with one retry, since a user who tripped it would otherwise have to sit out the
resend cooldown.

`delivered@resend.dev`, `bounced@resend.dev` and `complained@resend.dev` exercise delivery,
bounce and complaint handling without touching the domain reputation.

## Admin

One screen, reachable from the account menu, for the addresses listed in `ADMIN_EMAILS`
(default: the owner). Everyone else gets a 404 from every route under `/api/admin` — not a
403, so the surface does not announce that it exists.

It holds the things that are nobody else's business or nobody else's to act on:

- **Provider spend.** Today's requests against the budget, and what the provider itself
  reports. This used to be visible to every signed-in user, which put an account-wide
  resource in front of people who could do nothing about it.
- **The sync schedule**, and a button that runs it now — the same job the cron runs, under
  the same budget guard, with a per-run ceiling so a mis-click cannot spend the day. Choose
  the lane (auto, fixtures, catalog) and the ceiling; no shell on the server needed.
- **Accounts**: who has signed up, what they have logged, how many live sessions they hold
  and when those expire. Sessions can be revoked, and an account deleted with everything
  attached to it. Admin accounts are refused, so the button cannot lock you out.

## Layout

```
server/
  config.js          env parsing, one place
  db/                schema, migrations, the seed lists, the popularity ranks
  lib/admin.js       who may open the admin screen
  lib/email/         provider factory, console and Resend transports, the OTP template
  lib/               session, otp, name matching, shared match reads
  routes/            auth, catalog, matches, logs, stats, export, admin
  sync/              client, budget, seed, fixtures, cron, cli
web/
  src/App.jsx        shell: session, tab, season, and the data each screen needs
  src/components/    the five screens, the match card, the modals, admin, follow picker
  src/lib/           format and colour helpers, GSAP choreography, API client
```

Two rules live in `server/lib/present.js` so no route can forget them: a custom match is
visible only to the user who created it, and a match always carries the requesting user's
own watch log. Watch logs key off the local `matches.id`, which is stable across re-syncs,
so a score update from the provider can never orphan what a user recorded.

Anything calendar- or clock-shaped — late kick-offs, matches per day, month buckets, export
timestamps, is computed in the viewer's timezone, sent from the client. Otherwise a 9pm
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
