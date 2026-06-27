# Contributing to GatherHub

Thanks for your interest in improving GatherHub! This is an open-source MVP
and contributions of all sizes are welcome. Whether you are fixing a typo,
adding a feature, or writing tests, we appreciate your help.

## Table of contents

- [Setting up locally](#setting-up-locally)
- [Project structure](#project-structure)
- [Code guidelines](#code-guidelines)
- [Branching and commit conventions](#branching-and-commit-conventions)
- [Testing, linting, and formatting](#testing-linting-and-formatting)
- [Pull request process](#pull-request-process)
- [Reporting issues](#reporting-issues)
- [Good first issues](#good-first-issues)
- [Code of conduct](#code-of-conduct)

## Setting up locally

Follow the full step-by-step guide in [docs/local-development.md](docs/local-development.md)
to get the web app and Convex backend running locally. The short version:

1. **Prerequisites** — Node.js 20+ (`nvm use` picks up `.nvmrc`), npm 10+, a
   [Convex](https://convex.dev) account, and a [Clerk](https://clerk.com)
   account. Xcode 15+ is only needed for the iOS app.

2. **Clone and install**

   ```bash
   git clone https://github.com/yumaitau/GatherHub.git
   cd GatherHub
   nvm use
   npm install
   ```

3. **Configure environment**

   ```bash
   cp web/.env.example web/.env.local
   ```

   Fill in `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_PUBLIC_APP_URL` (set to
   `http://localhost:5173`), and optionally `VITE_GOOGLE_MAPS_API_KEY`. You will
   fill in `VITE_CONVEX_URL` after starting Convex.

4. **Start Convex and set secrets**

   ```bash
   npm run convex:dev
   ```

   Paste the printed deployment URL into `web/.env.local` as `VITE_CONVEX_URL`.
   Then set Convex-side environment variables (one-off):

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
   npx convex env set CLERK_SECRET_KEY        sk_test_...
   npx convex env set PUBLIC_APP_URL          http://localhost:5173
   ```

5. **Run the web app**

   ```bash
   npm run dev
   ```

   Open <http://localhost:5173>. Sign in and create or select a club.

6. **Seed demo data (optional)**

   ```bash
   npm run seed
   ```

7. **iOS app (optional)** — See [`ios/README.md`](ios/README.md).

For troubleshooting, refer to [docs/local-development.md](docs/local-development.md).

## Project structure

```
GatherHub/
├── web/                    # Vite + React web app (npm workspace)
│   ├── src/                #   UI, pages, components, hooks
│   │   ├── components/ui/  #     Reusable UI primitives (shadcn-style)
│   │   ├── components/     #     Feature components and shared helpers
│   │   ├── pages/          #     Route-level page components
│   │   └── lib/            #     Client-side utilities and helpers
│   ├── convex/             # Convex backend — schema, queries, mutations
│   │   ├── lib/            #   Shared backend helpers (auth, audit, etc.)
│   │   └── _generated/     #   Auto-generated Convex types (do not edit)
│   ├── eslint.config.js    # ESLint flat config
│   ├── vitest.config.ts    # Vitest config (Convex security suite + units)
│   └── tsconfig.json       # TypeScript config (extends tsconfig.base.json)
├── ios/                    # SwiftUI field-ops app (XcodeGen project)
│   └── GatherHub/          #   Views, Services, Sync, Design, Models
├── docs/                   # Architecture, data model, security, roadmap
│   └── issues/             #   Epic-based issue roadmap (16 epics, 165 issues)
├── package.json            # npm workspaces root
├── .nvmrc                  # Node.js version (20)
├── .prettierrc.json        # Prettier config
├── .prettierignore         # Prettier ignore patterns
├── .editorconfig           # EditorConfig rules
├── .husky/pre-commit       # Pre-commit hook (lint-staged → Prettier)
└── .github/workflows/ci.yml  # CI: lint, format check, typecheck, test, build
```

## Code guidelines

### Language and types

- **TypeScript everywhere** on the web. Strict mode is on — no `any`, no unused
  locals or parameters (prefix unused parameters with `_`).
- The iOS app is **SwiftUI**; follow Swift API Design Guidelines and match the
  existing code style.

### Backend is authoritative

All permission and tenant-isolation decisions live in Convex
(`web/convex/lib/auth.ts`). The client never decides what a user is allowed to
do — it only hides UI affordances for a better experience.

### Org scoping

Every tenant-scoped query/mutation derives `orgId` from the authenticated user's
Convex record (`users.activeOrgId`, validated against `memberships`) and
re-checks that any document it touches belongs to that org (`assertSameOrg`).
**Never** accept an `orgId` from the client, and **never** rely on a Clerk JWT
claim for tenancy — clubs live in Convex.

### Audit log is immutable

Asset operations append to `assetAuditLog`. There is no update/delete path for
audit rows — keep it that way.

### UI components

Reuse the primitives in `web/src/components/ui/` and the shared helpers in
`web/src/components/shared.tsx`. Match the style and patterns of existing pages.
Use Radix-based components (Dialog, Select, Tabs, etc.) from the `ui/` directory
rather than introducing new component libraries.

### Convex functions

- Keep queries and mutations focused — one responsibility per function.
- Use `web/convex/lib/` helpers for shared logic (auth, audit, idempotency, etc.).
- Never edit files in `web/convex/_generated/` — they are auto-generated by
  `convex dev`.

### Styling

- **Tailwind CSS** for all styling. Use the existing design tokens in
  `tailwind.config.js`.
- Follow the class ordering of existing components.
- Prettier and `tailwindcss-animate` are already configured — do not add
  competing animation libraries.

## Branching and commit conventions

### Branch naming

Use descriptive, lowercase, hyphenated branch names prefixed with the type of
change:

```
feat/add-sponsor-logo-upload
fix/asset-checkin-timestamp
docs/add-contribution-guide
chore/update-dependencies
test/add-convex-security-tests
```

### Commit messages

Write clear, present-tense summaries that describe what the commit does:

```
Add asset transfer mutation
Fix member lookup for inactive orgs
Update CONTRIBUTING.md with PR process
```

For related changes, group logical units into separate commits rather than one
large commit. Do not mix unrelated changes in a single commit.

### Conventional commit prefixes (optional but encouraged)

```
feat:     New user-facing feature
fix:      Bug fix
docs:     Documentation
chore:    Tooling, configuration, maintenance
test:     Test code
refactor: Code restructuring without behavior change
```

Example: `docs: add CONTRIBUTING.md`

## Testing, linting, and formatting

All checks must pass before a PR is merged. CI runs these automatically, but
run them locally first to save time.

### Linting

```bash
npm run lint
```

Uses ESLint with the flat config at `web/eslint.config.js`. TypeScript ESLint,
react-hooks, and react-refresh plugins are enabled. See the config for the full
rule set.

### Formatting

```bash
npm run format          # write fixes
npm run format:check    # check only (used in CI)
```

Prettier formats `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, and `.css`
files. The configuration lives in `.prettierrc.json`. A pre-commit hook
(lint-staged via Husky) auto-formats staged files, so formatting issues should
rarely reach CI.

### Type checking

```bash
npm --workspace web run typecheck
```

TypeScript strict mode is enabled. No `any` types, no unused locals. The config
extends `tsconfig.base.json` and includes both `src/` and `convex/`.

### Testing

```bash
npm --workspace web run test
```

Tests run with [Vitest](https://vitest.dev/) using the
[convex-test](https://www.npmjs.com/package/convex-test) edge runtime for
Convex function tests. The test suite includes:

- **Convex security tests** — permission checks, org isolation, audit integrity
  (see `web/convex/security.test.ts`).
- **Unit tests** — business logic in `web/convex/` (e.g., `assetFields.test.ts`,
  `fleet.test.ts`, `waste.test.ts`, `posts.test.ts`, `postNotifications.test.ts`).

Test files follow the `<name>.test.ts` naming convention and are co-located
with the modules they test.

### Pre-commit hook

Husky runs `lint-staged` on every commit, which applies Prettier to staged
files. If the hook fails, the commit is blocked — fix the issues and try again.

## Pull request process

1. **Pick or open an issue.** Browse the [issue roadmap](docs/issues/README.md)
   or [GitHub Issues](https://github.com/yumaitau/GatherHub/issues). If there is
   no existing issue for your change, open one first so maintainers can confirm
   the scope.

2. **Create a branch** from `main` using the [naming convention](#branching-and-commit-conventions).

3. **Make your changes** in logical commits. Keep the app runnable at every
   commit — do not push broken states.

4. **Run all checks** before pushing:

   ```bash
   npm run lint
   npm run format:check
   npm --workspace web run typecheck
   npm --workspace web run test
   ```

   CI runs the same checks (lint, format check, typecheck, test, build) on
   every push and pull request, so catching issues locally saves time.

5. **Push and open a PR** against `main`. Include:

   - A clear description of what the PR does and why.
   - A link to the related issue (e.g., `Closes #169`).
   - Any manual testing steps or screenshots for UI changes.

6. **Address review feedback.** Maintainers may request changes — push
   follow-up commits to the same branch. Avoid force-pushing after review has
   started.

7. **Merge.** Once approved and CI is green, a maintainer will merge your PR.

## Reporting issues

- **Search first** — check [existing issues](https://github.com/yumaitau/GatherHub/issues)
  to avoid duplicates.
- **Use the issue templates** if available. Otherwise, include:
  - A clear title and description.
  - Steps to reproduce (for bugs) or the use case (for features).
  - Expected vs. actual behavior.
  - Relevant environment details (Node version, browser, etc.).
- **Label your issue** using the [label glossary](docs/issues/README.md#label-glossary)
  if you have triage permissions, or mention the appropriate labels in the
  description for maintainers to apply.

### Label glossary

Issues are organised with area, type, and epic labels. See the
[full label glossary](docs/issues/README.md#label-glossary) for details. Key
labels:

| Label               | Meaning                                        |
| ------------------- | ---------------------------------------------- |
| `area:backend`      | Convex schema, queries, mutations, webhooks    |
| `area:web`         | Vite + React web application                   |
| `area:ios`         | SwiftUI iOS application                        |
| `area:auth`        | Authentication, Clerk, roles, multi-tenancy    |
| `area:kittrace`    | Asset tracking, operations, audit log, QR/NFC  |
| `area:docs`        | Documentation and guides                       |
| `type:feature`     | New user-facing functionality                  |
| `type:chore`       | Tooling, configuration, maintenance            |
| `type:test`        | Test code and quality automation               |
| `type:security`    | Security-sensitive work                        |
| `type:docs`        | Documentation deliverables                     |
| `good-first-issue` | Well-scoped tasks for new contributors         |

## Good first issues

Issues labelled [`good-first-issue`](https://github.com/yumaitau/GatherHub/labels/good-first-issue)
are well-scoped, low-context tasks that are ideal for first-time contributors.
Here is how to get started:

1. Browse [good-first-issue issues](https://github.com/yumaitau/GatherHub/issues?q=is%3Aissue+is%3Aopen+label%3Agood-first-issue).
2. Comment on the issue to express interest — maintainers will assign it to you.
3. Fork the repo (or use `gh repo fork`) and create a branch.
4. Follow the [local setup](#setting-up-locally) instructions.
5. Make your changes, run all [checks](#testing-linting-and-formatting), and
   open a PR.
6. If you get stuck, ask questions in the issue — we are happy to help.

Tips for first-time contributors:

- Start small — a documentation fix or test addition is a great way to learn the
  codebase.
- Read the [project structure](#project-structure) section to understand where
  code lives.
- Run the full test suite before opening a PR to catch issues early.
- Reference the issue number in your PR description (e.g., `Closes #169`).

## Code of conduct

Be kind and constructive. We are here to help volunteer-run clubs. Harassment,
abuse, or disrespectful behaviour will not be tolerated. Treat every contributor
with respect, assume good intent, and focus on building something useful
together.
