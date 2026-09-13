# Watchsheet design notes

How Watchsheet works and why, in more depth than the [README](../README.md).

A private logbook for football. One tap to mark a match watched. Notes and a 1–5 rating
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

Open http://localhost:5173. First run has an empty catalog, so see **The catalog** below.

For production:

```bash
npm run build               # builds web/dist
npm start                   # Express serves the API and the built app on :3000
```

Requires Node 22.13 or newer: the database layer uses the built-in `node:sqlite` module, so
there is no native build step and no compiler needed, and `.env` is read by Node itself.

### From your phone

The dev server binds every interface, so `npm run dev` prints a **Network** URL alongside
the local one. Open that on the phone; `ipconfig` confirms the address, which changes with
the DHCP lease. Nothing else needs configuring: the client's only `fetch` is a relative
`/api` path, so it resolves against whatever origin the page was loaded from and Vite
proxies it to the API. Do not swap that for an absolute `http://<ip>:3000`, which would make
every call cross-origin and drop the `sameSite=lax` session cookie.

If the page times out, the network is the problem rather than the app. Shared building and
campus WiFi commonly runs **client isolation**, which stops two devices on it talking to
each other at all, and no amount of configuration gets round that. Two ways out:

- **Turn on the phone's hotspot and join the laptop to it.** Nothing to install, nothing
  published, and the phone owns the network so isolation is not in play. Try this first.
- **Tunnel it**, if it needs to be reachable from off the network:
  `cloudflared tunnel --url http://localhost:5173`. The `allowedHosts` entry in
  `web/vite.config.js` is what lets the `*.trycloudflare.com` address through Vite's host
  check. This puts the dev app on a public URL for as long as it runs, and hot reload may
  not reconnect through it, though the app itself works.

On Windows, the first run may raise a Defender prompt for Node. Allow it on the network
you are on, or the port stays shut whatever the config says.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web dev server together |
| `npm run build` / `npm start` | production build, then serve |
| `npm run seed` | resolve the seed list against the provider (resumable) |
| `npm run sync` | refresh recent scores, then advance the season rotation |
| `npm run sync -- --max=10` | cap a run at ten requests |
| `npm run sync -- --season=2027` | rotate a specific season instead of the competition's own |
| `npm run sync:status` | today's spend, seed progress, fixture counts |
| `npm run migrate` | apply the schema (also runs automatically on boot) |
| `npm test` | provider parsing, sync edge cases against a stand-in provider, and the API against a throwaway database; sends no mail and spends no requests |

The **Admin** screen shows the same status inside the app, and can run any of the sync
commands without a shell on the server.

## The request budget

The free tier allows **100 requests a day**, which is the single biggest constraint on the
design. Three things follow from it:

1. **No user action ever reaches the provider.** Search, feeds, history and stats are all
   SQLite queries. Only the jobs under `server/sync/` hold a network client, and nothing
   outside that directory may import it.
2. **Every request is counted before it is made** (`server/sync/budget.js`), against a
   configurable budget that sits below the real cap: `HIGHLIGHTLY_DAILY_BUDGET`, default
   85. The provider's own `x-ratelimit-requests-remaining` header is recorded too, and
   whichever number is lower wins, so a restart or a second consumer of the key cannot
   cause an overspend.
3. **Running out is a normal outcome, not an error.** Every job commits progress
   incrementally and stops cleanly when the budget is gone. Re-running resumes where it
   left off.

## How syncing works

`/matches` accepts either a single calendar date (which returns every league on earth,
around 920 rows and ten pages for one day) or `leagueId` + `season`, which returns one
competition's entire season. The second form is dramatically cheaper, so the sync runs in
two lanes:

- **Rotation (bulk).** Each resolved competition is re-pulled in full, least recently
  synced first, one page at a time, with the cursor stored on the competition row. A full
  pass over ~36 competitions costs roughly 100–150 requests, so it completes over about two
  days and then starts again. Fixture lists change slowly; this is fine.
- **Refresh (scores).** Matches already held that have kicked off and are neither final nor
  postponed (a postponed fixture keeps its old date at the provider, and the rotation brings
  in the new one),
  queried as `leagueId` + `date`. The set of pairs comes from local data, so it only spends
  requests where fixtures actually exist, typically a handful even on a busy weekend.

Refresh runs first each tick because it is small and time-sensitive. A cron fires hourly and
spends at most `SYNC_SLICE` requests, so the budget guard is never the thing that stops a
run: **24 x `SYNC_SLICE` has to sit under `HIGHLIGHTLY_DAILY_BUDGET`**, and the server says so
at boot if it does not. It defaults to 3, which is 72 a day against a budget of 85.

The guard would catch an overspend either way, but it is the wrong safety net to rely on. A
schedule asking for more than the day holds does not overspend, it stops early: the allowance
goes by mid-afternoon and the evening's kick-offs, the ones with scores worth refreshing, get
nothing.

## The catalog

`npm run seed` resolves a starting list of teams and competitions against the provider. It
runs automatically in the background too, and takes priority over fixture syncing until it
finishes, since the rotation has nothing to work with until competitions resolve.

The league catalog (~900 entries) is mirrored into `provider_leagues` page by page, then
matched locally. Caching it means a budget stop resumes at an offset instead of restarting,
and re-matching after an alias change costs nothing at all. Teams then resolve one lookup
each. Expect 55–65 requests in total.

Matching is deliberately strict: exact name, then alias, then a whole-word prefix tier that
is rejected outright when two candidates fit equally well. A wrong match silently attaches a
follow to the wrong club, which is worse than not resolving at all. A seed name always
outranks an alias, which is what separates `UEFA Super Cup` from the 57 national competitions
literally named "Super Cup"; the German and Indian entries that share the name `Super Cup`
are told apart by a country hint on the seed row.

**That list is a starting menu, not the catalog.** Every team and competition the provider
resolves, including the several hundred picked up from fixtures, can be followed by any
user, at any time, from the Following tab. Nothing is auto-followed: a new account ends
sign-up by choosing for itself, and following a side only decides whose fixtures reach the
feed. It never marks anything watched.

Competitions are ordered by whether they are **currently being played**, then by a popularity
rank. Popularity alone left the World Cup and the Euros at the top of every list months after
their finals; a competition now counts as live if it has a fixture within the last 45 days or
any ahead of it (`server/lib/activity.js`). The window is wide enough to ride out an
international break or a half-synced season, and short enough that a tournament drops away
within weeks of its final. Nothing needs re-editing when qualifiers come round again.

The rank itself is stored on the row and re-applied on every boot from the ordered lists in
`server/db/popularity.js`, so it decides the order within the live set and among the dormant
ones. Changing it is a one-file edit.

Teams work the same way on a tighter window: one leads if it has a fixture in the **next ten
days**. The competition window is no use here, because every national side passes it through
the Nations League. The two calendars are kept apart on purpose, so clubs sit inside ten days
all season and drop out when the domestic fixtures stop for an international break, exactly
as the national sides come in. It inverts itself, so a World Cup needs no edit.

The search filter strip is deliberately **not** narrowed. It offers every competition holding
matches, live ones first. Ordering and filtering are different jobs, and search is where you
go to find something you have already watched: a tournament is at its most searchable just
after it finishes.

Six of the requested competitions and three of the teams are not carried by the provider at
all and are simply absent. **Add custom match** covers them, which is the intended route for
charity matches, Soccer Aid, the Durand Cup and the lower Nations League tiers.

## What counts as current

Watchsheet holds fixtures from **1 June 2026** onward and drops what came before
(`DATA_FLOOR_MS` in `server/lib/season.js`). Seasons turn over in June, on the same
boundary: Europe's domestic seasons finish in late May, so June is where the year actually
breaks. The two agreeing is what keeps the 2026 World Cup, which opened on 11 June, whole
inside a single season instead of split across the group stage and the final. Everything
Watchsheet holds is therefore one season, 26/27.

It is enforced in three places, because any one of them alone would leak:

- `writePage` in `server/sync/fixtures.js` drops pre-floor rows as they arrive. Both sync
  lanes write through it, so the guard is stated once.
- The rotation asks for the season being played, derived from the clock rather than pinned
  to a constant. A dozen competitions still carry a newest-advertised season of 2023-2025,
  and taken at their word they would re-import a back catalogue on every pass and pay for it
  out of the daily budget. A competition advertising a season *ahead* of this one is still
  believed: the Asian Cup is a 2027 tournament with no 2026 edition.
- `migrate()` deletes pre-floor fixtures on every boot, and re-stamps any row whose stored
  season disagrees with the rule. Both are cheap and settle to zero changes; stating an
  invariant somewhere it gets re-checked beats a one-shot migration.

Custom matches are exempt throughout. A record of a game someone watched is theirs, whenever
it was played; the floor is about seeded provider data.

## Email codes

Sign-in is a six-digit code, hashed at rest, valid for ten minutes, with a 30-second resend
cooldown and a five-attempt ceiling, all enforced server-side. The only thing asked for is
an address: a name belongs to an account, and until the code comes back there is no
account. A new one is created unnamed and the first screen after the code asks what to
call you, which is also why nothing records whether that step was taken. An account with no
name is owed it, exactly as an account with no follows is owed the picker.

Delivery is a swappable seam. With no Resend key the code is printed to the server output
and, with `OTP_DEV_ECHO=true`, shown on the verify screen, so the flow is genuinely usable
without a provider. The code itself is real either way; only delivery is local.

`server/lib/email/resend.js` is the live path, using the `resend` SDK. **To switch it on, set
`RESEND_API_KEY` in `.env` and restart.** Nothing else is needed: everything else is already
set in `server/config.js`.

- **Sender:** `Watchsheet <auth@mail.example.com>`. The subdomain is the one
  verified at Resend, and its DKIM (`resend._domainkey.notifications`), SPF and bounce MX
  (`send.notifications`) are already published. Because they sit under the subdomain, they
  never touch **another mail host**'s MX and SPF records on the apex, so there is nothing to merge.
- **Reply-to:** `hi@example.com`, the another mail host inbox. Resend is used for sending only, and its
  receiving side is deliberately left off, so replies are routed to another mail host by header instead.
- **Provider:** Resend whenever a key is present. `MAIL_PROVIDER=console` forces local delivery
  anyway, and `MAIL_FROM` / `MAIL_REPLY_TO` override the two addresses.

Once mail is really being delivered, the verify screen stops echoing the code whatever
`OTP_DEV_ECHO` says. Without a key the module reports itself unconfigured, and the factory
falls back to console delivery rather than failing sign-in.

The email follows the reader's light or dark theme where the client exposes it (Apple Mail,
Outlook for Mac, Samsung Mail, Thunderbird). Everywhere else, Gmail and Outlook for Windows
included, it is dark: the dark palette is the inline one, and light is layered on top only
through `prefers-color-scheme`.

It is set in Barlow, the site's face, where the client loads web fonts, and carries the site
logo as an inline attachment (`server/lib/email/logo.png`, rendered from
`web/public/logo.svg` at 144px, since Gmail and Outlook refuse SVG). Re-render the PNG if the
logo changes. Two details worth knowing: each
issued code carries an idempotency key (`signin-code/<row id>`), so a retry can never deliver
a second copy of the same code; and the account rate limit of ten requests a second is
absorbed with one retry, since a user who tripped it would otherwise have to sit out the
resend cooldown.

`delivered@resend.dev`, `bounced@resend.dev` and `complained@resend.dev` exercise delivery,
bounce and complaint handling without touching the domain reputation.

## Admin

One screen, reachable from the account menu, for the addresses listed in `ADMIN_EMAILS`
(default: the owner). Everyone else gets a 404 from every route under `/api/admin`, not a
403, so the surface does not announce that it exists.

It holds the things that are nobody else's business or nobody else's to act on:

- **Provider spend.** Today's requests against the budget, and what the provider itself
  reports. This used to be visible to every signed-in user, which put an account-wide
  resource in front of people who could do nothing about it.
- **The sync schedule**, and a button that runs it now: the same job the cron runs, under
  the same budget guard and the same per-run ceiling, so a mis-click cannot spend the day.
  No shell on the server needed. What the seed resolved is listed under it.
- **Accounts**: who has signed up, what they have logged, how many live sessions they hold
  and when those expire. Sessions can be revoked, and an account deleted with everything
  attached to it. Admin accounts are refused, so the button cannot lock you out.

## Layout

```
server/
  config.js          env parsing, one place
  db/                schema, migrations, the seed lists, the popularity ranks
  lib/admin.js       who may open the admin screen
  lib/activity.js    whether a competition is currently being played
  lib/season.js      season ids, the June rollover, and the date data starts from
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

Anything calendar- or clock-shaped (late kick-offs, matches per day, month buckets, export
timestamps) is computed in the viewer's timezone, sent from the client. Otherwise the same
kick-off would count as late or not depending on where the server happens to run.

A late kick-off is one starting between **9pm and 5am** in the viewer's own clock. The window
wraps deliberately: in India a European evening game starts after midnight, and those are the
ones you actually stay up for.

## Origin

The UI is a port of a Claude Design canvas, and the palette, type, spacing and GSAP entrance
choreography are carried over unchanged. Two things differ, both because real data now
exists: crests render as images with the coloured monogram as a fallback rather than always
drawing the monogram, and logs, follows and custom matches live on the server, leaving only
the theme on the device.

The animation helpers keep the canvas's three safety nets verbatim: settle before every
run, only hide-then-reveal inside a `requestAnimationFrame` while the document is visible,
and a timeout that forces the settled state. Together they mean the worst failure mode is
"no animation" rather than "invisible content".
