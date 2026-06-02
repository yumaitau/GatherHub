# Deployment & Self-Hosting Guide

GatherHub has two deployable pieces: the **Convex backend** and the **web
frontend** (a static SPA). The iOS app is distributed separately via Xcode /
TestFlight / the App Store.

## 1. Convex backend

Convex is fully managed; "self-hosting" means deploying to your own Convex
project.

```bash
cd web
npx convex deploy        # deploys schema + functions to your production deployment
```

Set the production environment variables in the Convex dashboard:

| Variable                   | Required | Purpose                                            |
| -------------------------- | -------- | -------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`  | Yes      | Validates Clerk JWTs (auth.config.ts).             |
| `CLERK_SECRET_KEY`         | Yes      | Creates Clerk invites and reads invite metadata.   |
| `PUBLIC_APP_URL`           | Yes      | Redirect target for Clerk invitation emails.       |
| `CLERK_WEBHOOK_SECRET`     | Optional | Verifies the Clerk webhook for server-side sync.   |
| `R2_ACCOUNT_ID`            | Yes      | Cloudflare account id for R2 presigned URLs.       |
| `R2_BUCKET`                | Yes      | R2 bucket for uploaded images and documents.       |
| `R2_ACCESS_KEY_ID`         | Yes      | R2 S3-compatible access key id.                    |
| `R2_SECRET_ACCESS_KEY`     | Yes      | R2 S3-compatible secret access key.                |

Leave `R2_ENDPOINT` unset unless an explicit endpoint is required. If set, it
must be the Cloudflare R2 S3 API endpoint, for example
`https://<account-id>.r2.cloudflarestorage.com`, not an `r2.dev` public bucket
URL or a custom domain. Presigned URLs are generated as
`https://<bucket>.<account-id>.r2.cloudflarestorage.com/<object-key>`.

### R2 CORS

Browser uploads use short-lived presigned R2 `PUT` URLs, so the R2 bucket must
allow CORS requests from the web app origin. GatherHub sends the file bytes
without custom browser request headers, so `AllowedHeaders` can be omitted. Add
a CORS policy in the bucket settings using exact origins only; do not include a
path or trailing slash.

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://app.gatherhub.au"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

If uploads fail with a browser preflight `403`, compare the blocked request in
DevTools with this policy: the request origin must be listed in
`AllowedOrigins`, and the intended method must be in `AllowedMethods`. If an
old client still sends `Access-Control-Request-Headers`, add those exact headers
to `AllowedHeaders` or redeploy the current web bundle.

The production Convex deployment exposes an HTTP site URL
(`https://<name>.convex.site`). Configure the Clerk webhook endpoint as
`<CONVEX_SITE_URL>/clerk-webhook` and subscribe to `user.*` events only.
GatherHub does not use Clerk Organizations; do not subscribe to
`organization.*` / `organizationMembership.*` events.

## 2. Web frontend

The web app is a static build. Build it with the production env vars:

```bash
cd web
VITE_CONVEX_URL=https://<name>.convex.cloud \
VITE_CLERK_PUBLISHABLE_KEY=pk_live_... \
VITE_PUBLIC_APP_URL=https://app.gatherhub.au \
VITE_GOOGLE_MAPS_API_KEY=<google_maps_browser_key> \
npm run build
```

The output in `web/dist/` can be served by any static host (Netlify, Vercel,
Cloudflare Pages, S3+CloudFront, nginx).

### SPA routing

Because the app uses client-side routing (including public routes like
`/a/:tagId` and `/club/:slug`), configure your host to **rewrite all unmatched
paths to `/index.html`**. Examples:

- **Netlify** — add `web/public/_redirects`:
  ```
  /*  /index.html  200
  ```
- **Vercel** — `vercel.json` with a catch-all rewrite to `/index.html`.
- **nginx** — `try_files $uri /index.html;`

### Security headers

Set the following response headers at your static host / CDN:

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.convex.cloud https://*.clerk.accounts.dev https://clerk.*; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), geolocation=()
```

> Note: `camera=(self)` is required for the in-browser QR scanner on the Scan
> page. Adjust `connect-src` to match your exact Convex/Clerk domains.

## 3. Custom domains

- Point `app.gatherhub.au` (or your domain) at the static host.
- Ensure `VITE_PUBLIC_APP_URL` matches so generated QR codes resolve correctly.
- Add the domain to Clerk's allowed origins.

## 4. Hosted option

For a hosted deployment, the simplest path is:

1. Convex production deployment via `npx convex deploy`.
2. Web app on Vercel/Netlify with the three `VITE_` env vars set in the host's
   dashboard and an SPA rewrite configured.
3. Clerk production instance with the `convex` JWT template, application
   invitations enabled, and optionally the webhook pointed at Convex.

## 5. Backups & data

Convex provides snapshots/export tooling from the dashboard. Export regularly,
especially before schema migrations. The audit log (`assetAuditLog`) is
append-only and should be retained for the life of each asset.
