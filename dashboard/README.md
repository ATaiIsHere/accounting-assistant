# Dashboard

This folder contains the Accounting Assistant dashboard.

It is now a:

- `React + Vite` single-page app
- deployed on **Cloudflare Pages**
- backed by **Pages Functions** for same-origin `/api/*` proxying
- connected to the existing `accounting-assistant` Worker for accounting data

## Folder layout

```text
dashboard/
|-- src/                  React UI
|-- functions/api/        Pages Functions proxy + session helpers
|-- public/               Static assets and SPA redirects
|-- vite.config.ts        Vite config
|-- wrangler.toml         Pages output config
`-- .dev.vars.example     Local Pages Functions env example
```

## Development

Install dependencies:

```bash
npm install
```

Run the frontend-only dev server:

```bash
npm run dev
```

This is fastest for UI work, but it does not emulate Pages Functions.

## Local Pages preview

If you want the real Pages behaviour, including `/api/*` proxying:

1. Copy the example env file:

```bash
Copy-Item .dev.vars.example .dev.vars
```

2. Start the local Pages preview:

```bash
npm run pages:dev
```

Required local variable:

- `API_BASE_URL`: the deployed `accounting-assistant` Worker URL
- `DASHBOARD_PROXY_SECRET`: must match the Worker secret exactly

Localhost bypasses Access JWT enforcement automatically, so you do not need Access env vars for normal local UI work.

## Testing and validation

Lint:

```bash
npm run lint
```

Production build:

```bash
npm run build
```

At the moment there are no dashboard-specific automated UI tests in this folder, so lint + build are the main validation steps.

## Deployment

Deploy to the existing Cloudflare Pages project:

```bash
npm run pages:deploy
```

The Pages project must have this runtime secret:

- `API_BASE_URL`
- `DASHBOARD_PROXY_SECRET`

To enforce Cloudflare Access inside Pages Functions, also configure:

- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`
- `CLOUDFLARE_ACCESS_AUD`

Example:

```bash
echo https://accounting-assistant.tai-accouting.workers.dev | npx wrangler pages secret put API_BASE_URL --project-name accounting-dashboard
```

## Zero Trust

Recommended production setup:

1. Protect the Pages domain with Cloudflare Access.
2. Let Access handle the human login challenge.
3. Let Pages Functions proxy `/api/*` to the Worker with the shared proxy secret.
4. Keep the Worker as the shared backend for dashboard, bot, and future agent tools.

`functions/api/session.ts` is prepared to surface the Access user email once the Pages domain is protected and Cloudflare forwards the identity headers.

### Step-by-step setup

If you want "users must log in before they can open the dashboard", the practical setup is:

1. Open the Cloudflare Zero Trust dashboard.
2. Go to `Access controls -> Applications`.
3. Choose `Add an application`.
4. Select `Self-hosted`.
5. For the application domain, enter your Pages production domain.

Example:

- `accounting-dashboard-bgf.pages.dev`

If you later bind a custom domain, protect that custom domain instead.

6. Add an `Allow` policy.
7. Choose who may sign in.

Common options:

- specific email addresses
- emails ending in your company domain
- your SSO / IdP group

8. Choose the identity providers you want to allow.

Examples:

- One-time PIN
- Google
- GitHub
- Microsoft Entra ID
- Okta

9. Save the Access application.

After that, visiting the Pages site should redirect unauthenticated users to the Access login flow.

### What this project already supports

This project already has a small helper route:

- `functions/api/session.ts`

When Access is active and Cloudflare forwards identity headers, this route can return:

- the authenticated user email
- whether the site is currently behind Access

### What this does now

This project now validates the Cloudflare Access JWT inside `functions/_middleware.ts`.

That means:

- without `DASHBOARD_PROXY_SECRET`, the Worker API rejects dashboard requests
- without a valid Access JWT, Pages rejects requests
- without `CLOUDFLARE_ACCESS_TEAM_DOMAIN` and `CLOUDFLARE_ACCESS_AUD`, production Pages returns `503` instead of serving a public dashboard

If you want stricter in-code verification, the next hardening step is to use:

- `@cloudflare/pages-plugin-cloudflare-access`

That plugin validates the Access JWT against your Access `domain` and application `aud` value.
