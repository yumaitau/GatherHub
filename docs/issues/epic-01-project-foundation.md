# Epic 1: Project Foundation

This epic establishes the technical foundation for GatherHub: a monorepo housing the Convex backend, the Vite + React + TypeScript web app, and the iOS SwiftUI client. It covers tooling (TypeScript, Tailwind, component library), the backend (Convex) and auth (Clerk) wiring, developer documentation, and continuous integration. Every later epic depends on the scaffolding delivered here, so the emphasis is on sensible defaults, reproducible setup, and a green CI pipeline from day one.

## Issue 1: Initialise monorepo

- **Title:** Initialise monorepo structure
- **Description:** Create the root repository layout that will hold the web app, the Convex backend functions, the iOS app, and shared documentation. Establish a package manager workspace so shared tooling and dependencies can be hoisted and managed consistently.
- **Goal:** A single repository where `web/`, `convex/`, `ios/`, and `docs/` coexist with a working workspace-aware package manager and a root README stub.
- **Acceptance criteria:**
  - [ ] Root `package.json` declares a workspace (pnpm or npm workspaces) including `web` and any shared packages.
  - [ ] Top-level directories exist: `web/`, `convex/`, `ios/`, `docs/`.
  - [ ] `.gitignore` covers `node_modules`, build output, `.env*`, Convex local artifacts, and Xcode build/derived data.
  - [ ] `.editorconfig` and `.nvmrc` (or equivalent Node version pin) are committed.
  - [ ] `pnpm install` (or chosen manager) completes with no errors on a clean checkout.
- **Technical notes:** Prefer pnpm workspaces for fast, content-addressed installs. Keep the iOS project as a sibling directory rather than a JS workspace member. Pin Node to an LTS version.
- **Dependencies:** None.
- **Labels:** `area:web`, `type:chore`, `epic:foundation`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 2: Configure TypeScript

- **Title:** Configure TypeScript across the workspace
- **Description:** Add a strict base TypeScript configuration shared by the web app and Convex functions, with per-package overrides as needed.
- **Goal:** Strict, consistent type checking with a shared base config and zero type errors on the scaffold.
- **Acceptance criteria:**
  - [ ] A `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride`.
  - [ ] `web/tsconfig.json` and `convex/tsconfig.json` extend the base.
  - [ ] Path aliases (e.g. `@/`) are configured and resolvable.
  - [ ] `pnpm typecheck` runs across packages and passes.
- **Technical notes:** Convex generates its own types into `convex/_generated`; ensure these are included but not linted as source. Use `tsc --noEmit` for the typecheck script.
- **Dependencies:** Epic 1 #1 Initialise monorepo
- **Labels:** `area:web`, `area:backend`, `type:chore`, `epic:foundation`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 3: Configure React frontend (Vite + React)

- **Title:** Scaffold the Vite + React + TypeScript web app
- **Description:** Set up the web frontend using Vite with React and TypeScript, including React Router for navigation.
- **Goal:** A running dev server rendering a placeholder home route via React Router.
- **Acceptance criteria:**
  - [ ] `web/` is a Vite React-TS project with `pnpm --filter web dev` serving locally.
  - [ ] React Router is installed with a root layout and at least two example routes.
  - [ ] Production build (`pnpm --filter web build`) succeeds.
  - [ ] A basic 404/not-found route is present.
- **Technical notes:** Use React Router data routers (`createBrowserRouter`). Keep routing config centralised for later epics (members, events, KitTrace). Vite env vars must be prefixed `VITE_`.
- **Dependencies:** Epic 1 #1 Initialise monorepo, Epic 1 #2 Configure TypeScript
- **Labels:** `area:web`, `type:chore`, `epic:foundation`
- **Estimated effort:** S (2-4h)

## Issue 4: Configure Tailwind

- **Title:** Configure Tailwind CSS
- **Description:** Add Tailwind to the web app with a design-token-friendly theme and dark mode support.
- **Goal:** Tailwind utility classes work end to end and a theme scaffold (colours, radius, fonts) is defined.
- **Acceptance criteria:**
  - [ ] Tailwind, PostCSS, and Autoprefixer configured; `content` globs cover all source files.
  - [ ] CSS variables for theme tokens (background, foreground, primary, etc.) are defined for light and dark.
  - [ ] A sample component renders with Tailwind classes applied.
  - [ ] `class`-based dark mode toggling works.
- **Technical notes:** Align token names with the shadcn-style component library in Issue 5 so the two integrate cleanly. Include `tailwindcss-animate` if using Radix-based components.
- **Dependencies:** Epic 1 #3 Configure React frontend
- **Labels:** `area:web`, `type:chore`, `epic:foundation`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 5: Configure component library (shadcn-style / Radix)

- **Title:** Set up shadcn-style component library
- **Description:** Install Radix primitives and the shadcn-style component generator, and add a starter set of components (button, input, dialog, dropdown, table, toast).
- **Goal:** A reusable UI kit available to all web features with consistent styling.
- **Acceptance criteria:**
  - [ ] shadcn-style CLI/config initialised pointing at the Tailwind theme.
  - [ ] Components added: Button, Input, Label, Dialog, DropdownMenu, Table, Toast/Sonner.
  - [ ] A `components/ui` directory holds generated components and is importable via the `@/` alias.
  - [ ] A demo page renders each component without errors.
- **Technical notes:** Components are copied into the repo (not a runtime dependency), so they can be customised. Ensure `cn` utility and `tailwind-merge` are wired up.
- **Dependencies:** Epic 1 #4 Configure Tailwind
- **Labels:** `area:web`, `type:chore`, `epic:foundation`
- **Estimated effort:** M (4-8h)

## Issue 6: Configure Convex

- **Title:** Configure Convex backend
- **Description:** Initialise the Convex project, connect it to the web app via the Convex React client, and add a trivial query to prove the wiring.
- **Goal:** The web app can call a Convex query/mutation against a deployed dev backend.
- **Acceptance criteria:**
  - [ ] `convex/` is initialised with a `schema.ts` stub and a sample `query`.
  - [ ] `ConvexProvider` (or Clerk-integrated provider) wraps the React app.
  - [ ] `VITE_CONVEX_URL` is read from env and used by the client.
  - [ ] A sample query result renders in the web app in dev.
- **Technical notes:** Use `convex dev` for local iteration. Keep schema empty-but-typed initially; later epics add tables. Prepare for Clerk auth integration (Issue 7) by structuring providers so Convex receives the Clerk token.
- **Dependencies:** Epic 1 #3 Configure React frontend, Epic 1 #2 Configure TypeScript
- **Labels:** `area:backend`, `type:chore`, `epic:foundation`
- **Estimated effort:** M (4-8h)

## Issue 7: Configure Clerk

- **Title:** Configure Clerk authentication provider
- **Description:** Wire Clerk into the web app and connect it to Convex so authenticated identity flows through to backend functions. Enable Clerk Organizations for multi-tenancy.
- **Goal:** A signed-in user's identity and active organisation are available to both the frontend and Convex.
- **Acceptance criteria:**
  - [ ] `ClerkProvider` wraps the app with the publishable key from env.
  - [ ] `ConvexProviderWithClerk` passes the Clerk token to Convex.
  - [ ] Clerk Organizations are enabled in the Clerk dashboard and reflected in the app session.
  - [ ] A protected sample route requires sign-in.
- **Technical notes:** Configure the Convex `auth.config.ts` with the Clerk JWT issuer. Organisation membership claims must be present in the token for org-scoped queries in Epic 2. Do not commit keys.
- **Dependencies:** Epic 1 #6 Configure Convex
- **Labels:** `area:auth`, `area:backend`, `area:web`, `type:chore`, `epic:foundation`
- **Estimated effort:** M (4-8h)

## Issue 8: Add environment variable documentation

- **Title:** Document environment variables
- **Description:** Create a `.env.example` and a documentation section enumerating every environment variable for web, Convex, and iOS.
- **Goal:** A new contributor can populate all required secrets/config from a single reference.
- **Acceptance criteria:**
  - [ ] `.env.example` lists `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, Convex/Clerk server keys, etc., with placeholder values and comments.
  - [ ] `docs/` includes an env reference describing each variable, where to obtain it, and which surface uses it.
  - [ ] iOS configuration values (Clerk publishable key, Convex URL) are documented.
  - [ ] No real secrets are committed.
- **Technical notes:** Distinguish client-exposed (`VITE_`/publishable) from server-only secrets. Note Convex env vars are set via the Convex dashboard/CLI, not the local `.env`.
- **Dependencies:** Epic 1 #6 Configure Convex, Epic 1 #7 Configure Clerk
- **Labels:** `area:docs`, `type:chore`, `epic:foundation`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 9: Add local development instructions

- **Title:** Write local development setup instructions
- **Description:** Document the end-to-end steps to run GatherHub locally: install, configure env, start Convex, start the web dev server, and open the iOS project.
- **Goal:** A contributor can go from clone to running app by following one document.
- **Acceptance criteria:**
  - [ ] Prerequisites listed (Node version, pnpm, Convex CLI, Xcode).
  - [ ] Step-by-step commands for install, `convex dev`, and web dev server.
  - [ ] Troubleshooting section for common issues (missing env, Convex not deployed).
  - [ ] Verified by following the steps on a clean machine/checkout.
- **Technical notes:** Reference the env doc from Issue 8 rather than duplicating it. Keep commands copy-pasteable.
- **Dependencies:** Epic 1 #8 Add environment variable documentation
- **Labels:** `area:docs`, `type:chore`, `epic:foundation`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 10: Add CI workflow

- **Title:** Add continuous integration workflow
- **Description:** Create a CI pipeline that installs dependencies, type-checks, lints, builds the web app, and runs tests on pull requests and pushes to the default branch.
- **Goal:** Every PR is automatically validated and must pass before merge.
- **Acceptance criteria:**
  - [ ] CI workflow file (e.g. GitHub Actions) runs on PR and push to main.
  - [ ] Jobs run install, `typecheck`, `lint`, web `build`, and `test`.
  - [ ] Dependency caching is enabled for fast runs.
  - [ ] The pipeline passes on the scaffolded repo.
- **Technical notes:** Use a matrix only if needed; keep it lean for MVP. Convex deployment is not part of CI yet. Test and lint jobs may be stubs until Epics 14/15 land, but the steps should exist.
- **Dependencies:** Epic 1 #2 Configure TypeScript, Epic 1 #3 Configure React frontend
- **Labels:** `area:backend`, `area:web`, `type:chore`, `epic:foundation`
- **Estimated effort:** M (4-8h)
