# Environment variables

Single reference for every variable GatherHub reads, where it is read, and how
to obtain it. Copy `web/.env.example` to `web/.env.local` and fill in the
client-exposed values; Convex-side variables live in the Convex deployment
environment, not the local `.env` file.

> Never commit real secrets. `.env.local` is gitignored.

## Web (`web/.env.local`)

Vite only exposes variables prefixed with `VITE_` to the browser bundle.

| Variable                      | Required | Used by                              | How to obtain                                                                 |
| ----------------------------- | -------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `VITE_CONVEX_URL`             | yes      | `web/src/main.tsx` (Convex client)   | Output of `npx convex dev` or the Convex dashboard → Settings → Deployment.   |
| `VITE_CLERK_PUBLISHABLE_KEY`  | yes      | `web/src/main.tsx` (Clerk provider)  | Clerk dashboard → API keys → Publishable key (`pk_test_…` / `pk_live_…`).     |
| `VITE_PUBLIC_APP_URL`         | yes      | QR code generator (`/a/:tagId` URLs) | The public URL that hosts the web app. Use `http://localhost:5173` locally.   |

## Convex deployment environment

Set via `npx convex env set NAME value` or the Convex dashboard → Settings →
Environment variables. These are **not** read from `.env.local`.

| Variable                    | Required | Used by                       | How to obtain                                                                                              |
| --------------------------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`   | yes      | `convex/auth.config.ts`       | Clerk dashboard → JWT templates → `convex` template → Issuer (e.g. `https://your-app.clerk.accounts.dev`). |
| `CLERK_WEBHOOK_SECRET`      | yes      | `convex/http.ts` (svix verify)| Clerk dashboard → Webhooks → endpoint → Signing secret.                                                    |

The Clerk JWT template must be named **`convex`** and must include
`org_id`, `org_slug`, `org_name`, `org_role` claims. See
`docs/security-model.md`.

## iOS (`ios/`)

The iOS scaffold reads its publishable key and Convex URL from
`ios/GatherHub/Configuration.plist` (not committed). Copy
`Configuration.example.plist` and fill in:

| Key                       | Source                                                  |
| ------------------------- | ------------------------------------------------------- |
| `ClerkPublishableKey`     | Same Clerk publishable key as the web app.              |
| `ConvexUrl`               | Same Convex deployment URL as the web app.              |

## Sanity check

After populating envs:

- `npm run dev` should start the web app without the "configuration needed"
  screen rendered by `web/src/main.tsx`.
- `npx convex env list` should show `CLERK_JWT_ISSUER_DOMAIN` and
  `CLERK_WEBHOOK_SECRET` for the active deployment.
