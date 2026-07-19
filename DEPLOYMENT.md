# Deployment

## Current and Target Hosting

Current legacy frontend:

```text
https://dedtsss.github.io/distance-points-on-the-map/
```

Target private production frontend and API:

```text
https://gps.bruce-group.net/
https://gps.bruce-group.net/api/upload
https://gps-guest.bruce-group.net/
https://gps-guest.bruce-group.net/api/upload
```

Production is prepared as two independent Cloudflare Workers that both serve the same Vite `dist` frontend and upload proxy API:

- owner Worker (`wrangler.toml`) for `gps.bruce-group.net` with Cloudflare Access (Google);
- guest Worker (`wrangler.guest.toml`) for `gps-guest.bruce-group.net` with Worker Basic Auth.

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
npx wrangler deploy --dry-run --config wrangler.guest.toml
```

## Production Worker Layout

`wrangler.toml` defines:

- Worker name: `gps-checker-map-photo`
- static assets directory: `./dist`
- assets binding: `ASSETS`
- Worker-first routing: all requests enter the Worker before assets are served
- custom domain: `gps.bruce-group.net`
- `workers_dev = false` so the production app is not exposed on a public `workers.dev` URL

`wrangler.guest.toml` defines:

- Worker name: `gps-checker-map-photo-guest`
- same entrypoint: `workers/host-proxy/worker.js`
- same static assets directory: `./dist`
- custom domain: `gps-guest.bruce-group.net`
- `BASIC_AUTH_REQUIRED = "true"` (guest-only fail-closed mode)
- `[secrets].required = ["BASIC_AUTH_USERNAME", "BASIC_AUTH_PASSWORD"]`
- `workers_dev = false`

Routes:

- `GET /` and static assets: served from `dist` after access checks
- `POST /api/upload`: upload proxy API
- `POST /`: legacy upload endpoint kept for old smoke scripts and old frontend builds

To change hostnames, update `[[routes]].pattern` in both Wrangler configs. Owner and guest names/routes must stay different.

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

Owner (`gps.bruce-group.net`): Cloudflare Access (Google login) stays enabled.
To avoid a second browser login prompt on owner hostname, keep `BASIC_AUTH_PASSWORD` unset in owner Worker.

Guest (`gps-guest.bruce-group.net`): Worker Basic Auth is mandatory on every browser request. `BASIC_AUTH_REQUIRED = "true"` makes the guest Worker fail closed: if `BASIC_AUTH_USERNAME` or `BASIC_AUTH_PASSWORD` is missing, frontend and `/api/upload` return `401` with `WWW-Authenticate: Basic` and `Cache-Control: no-store`.

First guest publication must upload the Worker and both Basic Auth secrets in the same deploy command so `gps-guest.bruce-group.net` is never published without credentials. Read the values silently, write them to a temporary JSON secrets file with mode `600`, deploy with `--secrets-file`, then delete the file immediately:

```bash
read -r -s -p "Guest username: " GUEST_BASIC_AUTH_USERNAME; echo
read -r -s -p "Guest password: " GUEST_BASIC_AUTH_PASSWORD; echo
export GUEST_BASIC_AUTH_USERNAME GUEST_BASIC_AUTH_PASSWORD
umask 077
guest_secrets_file="$(mktemp)"
cleanup_guest_secrets() {
  rm -f "$guest_secrets_file"
  unset GUEST_BASIC_AUTH_USERNAME GUEST_BASIC_AUTH_PASSWORD
}
trap cleanup_guest_secrets EXIT
chmod 600 "$guest_secrets_file"
python3 - <<'PY' > "$guest_secrets_file"
import json
import os
print(json.dumps({
  "BASIC_AUTH_USERNAME": os.environ["GUEST_BASIC_AUTH_USERNAME"],
  "BASIC_AUTH_PASSWORD": os.environ["GUEST_BASIC_AUTH_PASSWORD"],
}))
PY
npx wrangler deploy --secrets-file "$guest_secrets_file" --config wrangler.guest.toml
```

Do not echo credentials, paste them into shell history, commit them, or leave the custom hostname published from a deploy that did not include both `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD`. Rotate guest credentials by re-running the same temporary `--secrets-file` deploy command with new values. Code/config changes are not required.

If account-level Access default-deny is enabled, create an exact-host bypass only for `gps-guest.bruce-group.net` so the Worker Basic Auth prompt can be shown.

Rate-limit failed guest logins with an exact-host Cloudflare WAF rate limiting rule:

- Rule name: `GPS Guest Basic Auth failed login throttle`
- Scope/counting expression: `http.host eq "gps-guest.bruce-group.net" and http.response.code eq 401`
- Characteristics: client IP
- Threshold: 10 matching responses per 1 minute
- Mitigation: Block or Managed Challenge for 10 minutes

Do not apply this rule to `gps.bruce-group.net` or other BRUCE hostnames. Count only `401` responses so normal authenticated frontend and upload traffic is not rate-limited.

Worker fallback access remains available for CI/machine/break-glass via `APP_ACCESS_TOKEN` and `X-App-Access-Token` or `Authorization: Bearer` when `BASIC_AUTH_REQUIRED` is not enabled. Basic Auth never uses `APP_ACCESS_TOKEN` as a username or password; browser guest access uses only `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD`, and absent guest credentials never open the frontend or `/api/upload` publicly.

Do not commit secrets.

Default owner username is `owner` from `wrangler.toml` (used only if owner Basic Auth secret is intentionally configured):

```toml
[vars]
BASIC_AUTH_USERNAME = "owner"
```

Token/header access (owner machine access compatibility):

```bash
npx wrangler secret put APP_ACCESS_TOKEN --config wrangler.toml
```

Requests can then use:

```text
Authorization: Bearer <APP_ACCESS_TOKEN>
X-App-Access-Token: <APP_ACCESS_TOKEN>
```

Owner without `BASIC_AUTH_REQUIRED` keeps the previous Worker-level pass-through so Cloudflare Access can handle Google login without a second Basic Auth prompt. If owner is deployed without Cloudflare Access and without Worker auth secrets, that owner Worker is public. Configure one before production use.

## Custom Domain

Prerequisites:

- `bruce-group.net` is an active Cloudflare zone in the target account.
- No conflicting DNS record already exists for `gps.bruce-group.net`.
- No conflicting DNS record already exists for `gps-guest.bruce-group.net`.
- Workers are deployed with `[[routes]]` custom domain entries from both Wrangler configs.

Wrangler-managed custom domain:

```toml
[[routes]]
pattern = "gps.bruce-group.net"
custom_domain = true
```

Dashboard alternative:

1. Cloudflare Dashboard → Workers & Pages.
2. Select `gps-checker-map-photo` (owner) or `gps-checker-map-photo-guest` (guest).
3. Settings → Domains & Routes → Add → Custom Domain.
4. Enter `gps.bruce-group.net` for owner Worker or `gps-guest.bruce-group.net` for guest Worker.

Cloudflare creates or manages the required DNS/certificate state for the custom domain. Remove any conflicting manual DNS record first.

## GitHub Actions

Production Worker deploy:

```text
.github/workflows/deploy-worker.yml
.github/workflows/deploy-worker-guest.yml
```

Triggers:

- owner workflow: push to `main` and manual `workflow_dispatch`
- guest workflow: manual `workflow_dispatch` only

Neither deploys from PRs. Guest deploy workflow installs Playwright Chromium/dependencies, runs `npm test`, `npm run build:cloudflare`, `git diff --check`, owner+guest dry-runs, repository/build-output secret scan, validates GitHub secrets `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD`, then creates a temporary mode-`600` secrets file and deploys guest Worker/static assets with `wrangler deploy --secrets-file`. Credentials are not printed and the temporary file is deleted via `trap`.

Required GitHub secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
BASIC_AUTH_USERNAME
BASIC_AUTH_PASSWORD
```

Optional Worker secret for machine/break-glass access:

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
WORKER_URL=https://gps.bruce-group.net/api/upload WORKER_ACCESS_TOKEN=<token> node scripts/test-worker-upload.mjs
read -r -s -p "Guest username: " GUEST_BASIC_AUTH_USERNAME; echo
read -r -s -p "Guest password: " GUEST_BASIC_AUTH_PASSWORD; echo
export GUEST_BASIC_AUTH_USERNAME GUEST_BASIC_AUTH_PASSWORD
node scripts/test-worker-guest-auth.mjs
unset GUEST_BASIC_AUTH_USERNAME GUEST_BASIC_AUTH_PASSWORD
```

If Cloudflare Access protects the domain, use service token headers:

```bash
WORKER_URL=https://gps.bruce-group.net/api/upload \
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
npx wrangler deploy --dry-run --config wrangler.guest.toml
npx wrangler deploy --config wrangler.toml
```

For guest production, use the temporary `--secrets-file` command from Access Control instead of a plain deploy. Do not run any final deploy command until the custom domain and access policy/secrets are ready.

## Rollback

Options:

- Cloudflare Dashboard → Workers & Pages → `gps-checker-map-photo` → Deployments → Rollback.
- Revert the production commit and rerun the production workflow.
- Temporarily use the legacy GitHub Pages manual workflow while the Worker is fixed.

The old GitHub Pages URL is not removed by these changes.
