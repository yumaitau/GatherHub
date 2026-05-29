# Local development setup

End-to-end steps to get GatherHub running locally — clone to working app.

## Prerequisites

- **Node.js 20+** (a `.nvmrc` is committed; `nvm use` picks it up).
- **npm 10+** (ships with Node 20). The repo uses npm workspaces.
- **Convex account** — sign up at [convex.dev](https://convex.dev). Free tier
  is enough for development.
- **Clerk account** — sign up at [clerk.com](https://clerk.com). Enable
  **Organizations** in the Clerk dashboard.
- **Xcode 15+** — only required if you want to run the iOS scaffold.

## 1. Clone and install

```bash
git clone https://github.com/yumaitau/GatherHub.git
cd GatherHub
nvm use            # picks up .nvmrc
npm install        # installs the workspace
```

## 2. Configure environment

Copy the example env file and fill it in:

```bash
cp web/.env.example web/.env.local
```

You will fill in `VITE_CONVEX_URL` after step 3 (Convex prints it). For now
fill in:

- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk dashboard → API keys.
- `VITE_PUBLIC_APP_URL` — `http://localhost:5173`.

See [`docs/environment.md`](./environment.md) for the full variable reference.

## 3. Start Convex

In one terminal:

```bash
npm run convex:dev
```

The first run prompts you to link or create a Convex project. After it boots
it prints a URL such as `https://something-1234.convex.cloud` — paste this
into `web/.env.local` as `VITE_CONVEX_URL`.

Convex `dev` keeps a live deployment in sync with the `web/convex/` folder.
Leave it running.

### Set the Convex-side secrets (one-off)

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
npx convex env set CLERK_WEBHOOK_SECRET    whsec_<from-clerk-dashboard>
```

`CLERK_JWT_ISSUER_DOMAIN` is the Clerk Frontend API URL. `CLERK_WEBHOOK_SECRET`
is the signing secret of the Clerk webhook you configure to point at
`<your-convex-url>/clerk-webhook` (subscribe to `user.*`,
`organization.*`, `organizationMembership.*`).

Configure the Clerk JWT template named **`convex`** with org claims. See
`docs/security-model.md` for the exact template body.

## 4. Run the web app

In a second terminal:

```bash
npm run dev
```

Open <http://localhost:5173>. Unauthenticated users are redirected to
`/sign-in`. After signing in and selecting/creating an organisation you
land on the dashboard.

## 5. Seed sample data (optional)

```bash
npm run seed
```

Runs `convex/seed.ts` against the active dev deployment. Useful for demos.

## 6. Run the iOS scaffold (optional)

```bash
cd ios
xcodegen generate
open GatherHub.xcodeproj
```

Build and run on the simulator. The Swift app reuses the same Convex
deployment and Clerk publishable key configured above; populate
`Configuration.plist` from `Configuration.example.plist`.

## Useful scripts

| Script                       | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `npm run dev`                | Vite dev server                               |
| `npm run convex:dev`         | Convex dev deployment (live function reload)  |
| `npm run build`              | Type-check + production build                 |
| `npm run lint`               | ESLint                                        |
| `npm run format`             | Prettier write                                |
| `npm --workspace web test`   | Vitest (Convex security suite + units)        |
| `npm run seed`               | Seed sample data                              |

## Troubleshooting

**"Configuration needed" screen on first load.** `VITE_CONVEX_URL` or
`VITE_CLERK_PUBLISHABLE_KEY` is missing from `web/.env.local`. Restart
`npm run dev` after editing env values — Vite only reads env on start.

**"Not authenticated or not a member of an organisation".** Clerk
Organizations is not enabled, or you have not selected an org. Click the
organisation switcher in the top bar to create or select one.

**Convex says `CLERK_JWT_ISSUER_DOMAIN not set`.** Run
`npx convex env set CLERK_JWT_ISSUER_DOMAIN https://…` against the active
deployment.

**Webhook events not arriving.** Check the Clerk webhook URL points at
`<CONVEX_SITE_URL>/clerk-webhook` (the Convex *site* URL, not the cloud
URL) and that `CLERK_WEBHOOK_SECRET` matches.

**TypeScript errors in `web/convex/_generated/`.** Run
`npm run convex:dev` once so Convex regenerates types after a schema
change.
