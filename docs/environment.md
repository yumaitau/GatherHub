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
| `VITE_GOOGLE_MAPS_API_KEY`    | no       | Location/address inputs              | Google Cloud → Maps Platform key. Enable Maps JavaScript API and Places API (New). |

The web app also accepts `VITE_GOOGLE_MAPS_KEY` as a local fallback alias, but
Cloudflare Pages should use the canonical `VITE_GOOGLE_MAPS_API_KEY` name.

## Convex deployment environment

Set via `npx convex env set NAME value` or the Convex dashboard → Settings →
Environment variables. These are **not** read from `.env.local`.

| Variable                          | Required | Used by                                | How to obtain                                                                                              |
| --------------------------------- | -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`         | yes      | `convex/auth.config.ts`                | Clerk dashboard → JWT templates → `convex` template → Issuer (e.g. `https://your-app.clerk.accounts.dev`). |
| `CLERK_SECRET_KEY`                | yes      | `convex/invitations.ts`, sync actions  | Clerk dashboard → API keys → Secret key (`sk_test_…` / `sk_live_…`).                                       |
| `PUBLIC_APP_URL`                  | yes      | Clerk invitation redirect URL          | The public URL that hosts the web app. Use `http://localhost:5173` locally.                                |
| `CLERK_WEBHOOK_SECRET`            | no       | `convex/http.ts` (svix verify)         | Clerk dashboard → Webhooks → endpoint → Signing secret.                                                    |
| `TASK_REMINDER_EMAIL_WEBHOOK_URL` | no       | `convex/taskReminderEmailSender.ts`    | HTTPS endpoint that accepts overdue task reminder payloads and sends email.                                |
| `TASK_REMINDER_WEBHOOK_URL`       | no       | `convex/taskReminderEmailSender.ts`    | Backwards-compatible alias for `TASK_REMINDER_EMAIL_WEBHOOK_URL`.                                          |
| `TASK_REMINDER_WEBHOOK_TOKEN`     | no       | `convex/taskReminderEmailSender.ts`    | Optional bearer token sent to the reminder webhook.                                                        |
| `RESEND_API_KEY`                  | no       | `convex/taskReminderEmailSender.ts`    | Resend API key for direct overdue task reminder delivery.                                                  |
| `TASK_REMINDER_FROM_EMAIL`        | no       | `convex/taskReminderEmailSender.ts`    | Required with `RESEND_API_KEY`. Must be a verified sender/domain in Resend.                                |
| `RESEND_FROM_EMAIL`               | no       | `convex/taskReminderEmailSender.ts`    | Backwards-compatible alias for `TASK_REMINDER_FROM_EMAIL`.                                                 |

The Clerk JWT template must be named **`convex`**. The default identity claims
(subject, email, name, picture) are enough — GatherHub does **not** use Clerk
Organizations, so no `org_*` claims are required. Invitation org/role metadata
is read from Clerk server-side using `CLERK_SECRET_KEY`, not trusted from the
browser. See `docs/security-model.md`.

## iOS (`ios/`)

The iOS scaffold reads public client configuration from
`ios/GatherHub/Config/Secrets.swift`.

| Key                       | Source                                                  |
| ------------------------- | ------------------------------------------------------- |
| `clerkPublishableKey`     | Same Clerk publishable key as the web app.              |
| `convexDeploymentURL`     | Same Convex deployment URL as the web app.              |
| `GOOGLE_MAPS_API_KEY`     | Separate iOS-restricted Google Maps Platform key, injected via `ios/Config/AppSecrets.xcconfig` or CI build setting. |

## Sanity check

After populating envs:

- `npm run dev` should start the web app without the "configuration needed"
  screen rendered by `web/src/main.tsx`.
- `npx convex env list` should show `CLERK_JWT_ISSUER_DOMAIN`,
  `CLERK_SECRET_KEY`, and `PUBLIC_APP_URL` for the active deployment.
- If task reminders should email assignees, set either `RESEND_API_KEY` plus
  `TASK_REMINDER_FROM_EMAIL`, or set `TASK_REMINDER_EMAIL_WEBHOOK_URL` to a
  custom email service webhook. Without one of those, overdue reminders are
  queued in Convex but not delivered.
