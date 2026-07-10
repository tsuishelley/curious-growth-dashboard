# Curious Portfolio Growth Dashboard

A single dashboard, gated behind login, with one tab per portfolio company. Pulls daily
snapshots from GA4, HubSpot, PostHog, and Search Console, and shows leading indicators of
growth plus an end-to-end conversion funnel per company.

Companies configured today: Convox, Polymer, Buildfire, Uservoice (see
[`lib/config/portfolio.ts`](lib/config/portfolio.ts)).

## How it works

- **Auth**: Firebase Authentication (Google sign-in), restricted to `@curious.vc` accounts.
- **Data store**: Firestore holds only normalized daily snapshots — no raw API credentials.
- **Sync**: A Vercel Cron Job hits `/api/cron/sync` once a day. It pulls from whichever
  sources each company has env vars configured for, and skips (marks "not connected")
  anything that isn't set up yet — the job never fails just because access is partial.
- **Credentials**: live only as environment variables (Vercel project settings in
  production, `.env.local` locally) — never in Firestore or client-side code.
- **AI weekly insights**: a second Vercel Cron Job hits `/api/cron/insights` once a week
  (Mondays). For each company it sends this-week-vs-prior-week metrics to Claude
  (`claude-opus-4-8`) and stores a short bullet summary of the leading indicators, which
  renders at the top of that company's tab. Requires `ANTHROPIC_API_KEY`; if it's unset,
  insights are simply skipped and the rest of the dashboard is unaffected. To generate on
  demand: `curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/insights?force=1"`.

## One-time setup (you'll need to do this yourself — it's all interactive account creation)

### 1. Firebase project
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → create in production mode (any region).
4. **Project settings** → **General** → add a Web app → copy the config values into
   `NEXT_PUBLIC_FIREBASE_*` in your `.env.local` (see `.env.local.example`).
5. **Project settings** → **Service accounts** → Generate new private key → paste the
   downloaded JSON as a single-line string into `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`.
6. Deploy `firestore.rules` (via the Firebase console's Rules tab, or the Firebase CLI:
   `firebase deploy --only firestore:rules`) — it locks out all direct client access,
   since this app only reads/writes Firestore through the server.

### 2. Vercel project
1. Import this repo at [vercel.com/new](https://vercel.com/new).
2. Add all the env vars from `.env.local.example` in Project Settings → Environment
   Variables (including `CRON_SECRET`, any random long string you generate yourself).
3. Deploy. `vercel.json` already defines the daily cron schedule (`/api/cron/sync` at
   noon UTC) — Vercel picks it up automatically and sends `CRON_SECRET` as a Bearer
   token, which the route checks.

### 3. Per-company data source access
Only fill in what you currently have — anything missing just shows as "not connected"
in the dashboard rather than breaking the sync.

- **GA4** (shared across all companies): create one Google service account, enable the
  Google Analytics Data API on its project, and have each portfolio company add that
  service account's email as a **Viewer** on their GA4 property. Put the service
  account's JSON key in `GA4_SERVICE_ACCOUNT_JSON`, and each company's GA4 property ID
  (format `properties/123456789`) in `<COMPANY>_GA4_PROPERTY_ID`.
- **Search Console** (shared service account — reuses the same `GA4_SERVICE_ACCOUNT_JSON`,
  no separate credential needed): enable the **Search Console API** on that same Google
  Cloud project, then have each portfolio company add the service account's email as a
  user in Search Console → Settings → Users and permissions (Full or Restricted access
  both work, since we only read data). Put each company's site URL (format
  `sc-domain:example.com` for domain properties, or `https://www.example.com/` for
  URL-prefix properties — check which type the property is in Search Console) in
  `<COMPANY>_SEARCH_CONSOLE_SITE_URL`. Note: Search Console data has a ~2-3 day
  reporting lag, so "today's" synced numbers reflect a few days back.
- **HubSpot** (Buildfire, Uservoice): each company creates a
  [private app](https://developers.hubspot.com/docs/api/private-apps) with `crm.objects.contacts.read`
  and `crm.objects.deals.read` scopes, and shares the access token →
  `<COMPANY>_HUBSPOT_TOKEN`.
- **PostHog** (Convox, Polymer): each company shares a **Personal API Key** (not the
  public `phc_...` client-tracking key — that one can't query data) and their project's
  numeric **Project ID** (a plain number, not `phc_...` either — found on the same
  Project Settings page) → `<COMPANY>_POSTHOG_API_KEY` / `<COMPANY>_POSTHOG_PROJECT_ID`.
  If their signup/activation event names aren't `sign_up` / `activated`, set
  `signupEvent` / `activationEvent` for that company in `lib/config/portfolio.ts`.
  Optionally, if a company has its own saved PostHog funnel Insight (e.g. a
  marketing-visit-to-paid attribution funnel), set `attributionFunnelInsightId` to that
  Insight's `short_id` to surface it as a secondary funnel + channel-breakdown table on
  their dashboard tab (re-run live over a trailing 30 days, not the Insight's saved date
  range). Note: this only counts conversions PostHog can link across pages as the same
  person — if a marketing site and app don't share identity (no `identify`/`alias` call
  linking an anonymous visit to the later signed-in user), this will undercount real
  conversions significantly. Convox's is configured as an example (`oE4iEQUB`).
- **Google Ads** (shared OAuth credentials — unlike GA4/Search Console, this can't use a
  simple service-account key): gives paid-acquisition leading indicators (spend, clicks,
  CPC, conversions) per company.
  1. **Manager account**: if Curious doesn't already have a Google Ads Manager (MCC)
     account, create one free at
     [ads.google.com/home/tools/manager-accounts](https://ads.google.com/home/tools/manager-accounts/).
     Ask each portfolio company to send an account-link invitation from their Ads
     account to your Manager account ID (Admin → Access and security → Managers), then
     accept it from your side.
  2. **Developer Token**: in that Manager account, go to Tools & Settings → Setup → API
     Center → Apply for token. Test-account access is instant; real data needs **Basic**
     access, which Google reviews (budget a few business days).
  3. **OAuth client**: in Google Cloud Console (can reuse the same project as the GA4
     service account), enable the **Google Ads API**, then create an OAuth 2.0 Client ID
     (type: **Web application**, with `https://developers.google.com/oauthplayground`
     added as an authorized redirect URI). If your Cloud project is tied to the
     `curious.vc` Workspace, set the OAuth consent screen's user type to **Internal** —
     this skips Google verification and avoids refresh tokens expiring after 7 days.
  4. **Refresh token**: mint it once via
     [Google's OAuth Playground](https://developers.google.com/oauthplayground) — gear
     icon → "Use your own OAuth credentials" with the Client ID/Secret from step 3, then
     authorize the custom scope `https://www.googleapis.com/auth/adwords` signed in as
     the Google account with Manager-account access, and exchange the code for tokens.
     This is what the dashboard uses on an ongoing basis.
  5. **Env vars**: put the developer token, OAuth client ID/secret, refresh token, and
     your Manager account ID (digits only) in `GOOGLE_ADS_DEVELOPER_TOKEN` /
     `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` / `GOOGLE_ADS_REFRESH_TOKEN` /
     `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (shared across all companies, like the GA4 service
     account). Then put each company's own Ads customer ID (digits only, no dashes) in
     `<COMPANY>_GOOGLE_ADS_CUSTOMER_ID`.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in at least the Firebase values
npm run seed                       # populates 30 days of sample data per company
npm run dev                        # http://localhost:3000
```

Sign in with a `@curious.vc` Google account. Any company/source without real credentials
configured will show a "not connected" badge; seeded data is clearly labeled "sample data"
in the UI so it's never confused with a real sync.

To trigger a real sync locally once you've added credentials:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
```

## Adding or removing a portfolio company

Edit [`lib/config/portfolio.ts`](lib/config/portfolio.ts) — add an entry with the
company's `id`/`name`/`slug`, which sources it uses (and the env var names holding its
credentials), and its funnel stage definition. No other code changes are needed; the
tab bar, sync job, and dashboard page all read from this config.
