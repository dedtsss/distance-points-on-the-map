# Deployment

## Current and Target Hosting

Current legacy frontend:

```text
https://dedtsss.github.io/distance-points-on-the-map/
```

Target private production frontend and API:

```text
https://gps.brus-group.net/
https://gps.brus-group.net/api/upload
```

Production is prepared as one Cloudflare Worker that serves the Vite `dist` frontend through Workers Static Assets and handles the upload proxy API from the same origin.

## Local Development

```bash
npm install
npm run dev
```

The local Vite dev server uses root base `/`. Upload defaults to `/api/upload`, so local uploads require a Worker-compatible proxy if you run the app outside Cloudflare.

## Local Production Preview

Build the Cloudflare production bundle:

```bash
npm run build:cloudflare
```

Run Vite preview for frontend-only checks:

```bash
npm run preview
```

Run a Worker/static-assets dry run:

```bash
npx wrangler deploy --dry-run --config wrangler.toml
```

## Production Worker Layout

`wrangler.toml` defines:

- Worker name: `gps-checker-map-photo`
- static assets directory: `./dist`
- assets binding: `ASSETS`
- Worker-first routing: all requests enter the Worker before assets are served
- custom domain: `gps.brus-group.net`
- `workers_dev = false` so the production app is not exposed on a public `workers.dev` URL

Routes:

- `GET /` and static assets: served from `dist` after access checks
- `POST /api/upload`: upload proxy API
- `POST /`: legacy upload endpoint kept for old smoke scripts and old frontend builds

To change the production hostname, update the single `[[routes]].pattern` value in `wrangler.toml`. The GitHub Actions environment URL is display-only and should be updated to match.

## Vite Base and API URL

Cloudflare production build:

```bash
npm run build:cloudflare
```

Uses:

```text
VITE_BASE_PATH=/
VITE_UPLOAD_PROXY_URL=/api/upload
```

Legacy GitHub Pages build:

```bash
npm run build:github-pages
```

Uses:

```text
VITE_BASE_PATH=/distance-points-on-the-map/
```

For one-off builds, override:

```bash
VITE_BASE_PATH=/ VITE_UPLOAD_PROXY_URL=/api/upload npm run build
```

## Access Control

Preferred production protection: Cloudflare Access.

1. In Cloudflare Zero Trust, create a Self-hosted/private Access application.
2. Add public hostname `gps.brus-group.net`.
3. Add an Allow policy for the owner identity only.
4. Keep Worker fallback auth disabled or set it as a backup.

Worker fallback protection is also implemented. Do not commit secrets.

Basic Auth:

```bash
npx wrangler secret put BASIC_AUTH_PASSWORD --config wrangler.toml
```

Default username is `owner` from `wrangler.toml`:

```toml
[vars]
BASIC_AUTH_USERNAME = "owner"
```

Token/header access:

```bash
npx wrangler secret put APP_ACCESS_TOKEN --config wrangler.toml
```

Requests can then use:

```text
Authorization: Bearer <APP_ACCESS_TOKEN>
X-App-Access-Token: <APP_ACCESS_TOKEN>
```

If neither Cloudflare Access nor a Worker auth secret is configured, the deployed Worker is public. Configure one before production use.

## Custom Domain

Prerequisites:

- `brus-group.net` is an active Cloudflare zone in the target account.
- No conflicting DNS record already exists for `gps.brus-group.net`.
- The Worker is deployed with the `[[routes]]` custom domain entry from `wrangler.toml`.

Wrangler-managed custom domain:

```toml
[[routes]]
pattern = "gps.brus-group.net"
custom_domain = true
```

Dashboard alternative:

1. Cloudflare Dashboard → Workers & Pages.
2. Select `gps-checker-map-photo`.
3. Settings → Domains & Routes → Add → Custom Domain.
4. Enter `gps.brus-group.net`.

Cloudflare creates or manages the required DNS/certificate state for the custom domain. Remove any conflicting manual DNS record first.

## GitHub Actions

Production Worker deploy:

```text
.github/workflows/deploy-worker.yml
```

Triggers:

- push to `main`
- manual `workflow_dispatch`

It does not deploy from PRs. It runs `npm test`, builds with `npm run build:cloudflare`, then deploys Worker plus static assets.

Required GitHub secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Optional GitHub secret for manual smoke tests against token-protected Worker:

```text
APP_ACCESS_TOKEN
```

Optional GitHub secrets for manual smoke tests through Cloudflare Access service tokens:

```text
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
```

Legacy GitHub Pages:

```text
.github/workflows/deploy.yml
```

This is manual-only and builds with the legacy `/distance-points-on-the-map/` base. It is not the primary production path.

Manual Worker smoke test:

```bash
WORKER_URL=https://gps.brus-group.net/api/upload WORKER_ACCESS_TOKEN=<token> node scripts/test-worker-upload.mjs
```

If Cloudflare Access protects the domain, use service token headers:

```bash
WORKER_URL=https://gps.brus-group.net/api/upload \
CF_ACCESS_CLIENT_ID=<client-id> \
CF_ACCESS_CLIENT_SECRET=<client-secret> \
node scripts/test-worker-upload.mjs
```

## Production Deploy Commands

Manual local sequence:

```bash
npm ci
npm test
npm run build:cloudflare
npx wrangler deploy --dry-run --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

Do not run the final deploy command until the custom domain and access policy/secrets are ready.

## Rollback

Options:

- Cloudflare Dashboard → Workers & Pages → `gps-checker-map-photo` → Deployments → Rollback.
- Revert the production commit and rerun the production workflow.
- Temporarily use the legacy GitHub Pages manual workflow while the Worker is fixed.

The old GitHub Pages URL is not removed by these changes.
