# Epic 15: Testing & Quality

This epic establishes the testing and quality tooling: unit tests, Convex function tests, frontend component tests, Playwright E2E, a mobile smoke checklist, seed data and a test organisation, accessibility checks, linting, and formatting. It provides the safety net that the security tests (Epic 14) and feature epics rely on, and wires everything into CI.

## Issue 1: Unit test setup

- **Title:** Unit test framework setup
- **Description:** Configure a unit test runner (e.g. Vitest) for the web app and shared utilities.
- **Goal:** A working unit test runner with coverage and a sample passing test.
- **Acceptance criteria:**
  - [ ] Test runner configured with TypeScript support.
  - [ ] `pnpm test` runs unit tests; coverage reporting available.
  - [ ] A sample test passes.
  - [ ] Integrated into CI.
- **Technical notes:** Vitest pairs well with Vite. Configure jsdom for component tests (Issue 3). Keep config shared where possible.
- **Dependencies:** Epic 1 #2 Configure TypeScript, Epic 1 #10 Add CI workflow
- **Labels:** `area:web`, `type:test`, `type:chore`, `epic:testing`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 2: Convex function tests

- **Title:** Convex function tests
- **Description:** Set up the Convex testing harness and write tests for representative queries/mutations.
- **Goal:** Backend functions are testable with a working harness and example tests.
- **Acceptance criteria:**
  - [ ] Convex test harness configured.
  - [ ] Example tests cover a query and a mutation with auth context.
  - [ ] Tests run locally and in CI.
  - [ ] Provides the basis for permission tests (Epic 14).
- **Technical notes:** Use `convex-test` (or the official harness). Establish patterns for seeding data and simulating identity that Epic 14 #2 extends.
- **Dependencies:** Epic 1 #6 Configure Convex, Epic 15 #1 Unit test setup
- **Labels:** `area:backend`, `type:test`, `epic:testing`
- **Estimated effort:** M (4-8h)

## Issue 3: Frontend component tests

- **Title:** Frontend component tests
- **Description:** Add component testing for key UI components and pages using Testing Library.
- **Goal:** Critical components are covered by rendering/interaction tests.
- **Acceptance criteria:**
  - [ ] Testing Library configured with the unit runner.
  - [ ] Tests for several key components (forms, tables, widgets).
  - [ ] Tests assert behaviour and accessibility roles.
  - [ ] Run in CI.
- **Technical notes:** Mock Convex/Clerk providers as needed. Prefer role/text queries over test ids for accessibility.
- **Dependencies:** Epic 15 #1 Unit test setup, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `type:test`, `epic:testing`
- **Estimated effort:** M (4-8h)

## Issue 4: Playwright E2E tests

- **Title:** Playwright E2E tests
- **Description:** Set up Playwright and author end-to-end tests for critical flows (sign-in, create member, check-out asset, public lookup).
- **Goal:** Critical user journeys are validated end to end.
- **Acceptance criteria:**
  - [ ] Playwright configured against a test environment.
  - [ ] E2E covers auth, a core CRUD flow, an asset operation, and a public route.
  - [ ] Runs headless in CI (with appropriate gating).
  - [ ] Stable with reasonable retries.
- **Technical notes:** Use the test organisation and seed data (Issues 6-7). Handle Clerk auth in tests via a test user or token. E2E may run on a schedule/labelled PRs if slow.
- **Dependencies:** Epic 15 #6 Seed data, Epic 15 #7 Test organisation
- **Labels:** `area:web`, `type:test`, `epic:testing`
- **Estimated effort:** L (1-2d)

## Issue 5: Mobile smoke test checklist

- **Title:** Mobile smoke test checklist
- **Description:** A documented manual smoke-test checklist for the iOS app covering core flows.
- **Goal:** A repeatable manual checklist to validate the iOS app before releases.
- **Acceptance criteria:**
  - [ ] Checklist covers sign-in, org selection, asset lookup, QR/NFC scan, check-out/in, event RSVP, and offline error states.
  - [ ] Each item has clear pass/fail criteria.
  - [ ] Stored in docs and referenced by the release checklist.
  - [ ] Used at least once and refined.
- **Technical notes:** Automated iOS UI tests are out of scope for MVP; this checklist covers the gap. Aligns with Epic 12 features.
- **Dependencies:** Epic 12 #1 SwiftUI app project
- **Labels:** `area:ios`, `area:docs`, `type:test`, `epic:testing`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 6: Seed data

- **Title:** Seed data
- **Description:** A script to seed a Convex deployment with realistic sample data (members, teams, events, assets, sponsors).
- **Goal:** Developers and tests can populate a deployment with representative data.
- **Acceptance criteria:**
  - [ ] Seed script creates members, teams, events, assets, and sponsors.
  - [ ] Idempotent or clearly resets before seeding.
  - [ ] Documented usage.
  - [ ] Used by E2E tests where helpful.
- **Technical notes:** Implement as a Convex internal mutation/action invoked via CLI. Keep data plausible (varied statuses, some checked-out/lost assets, expiring certs).
- **Dependencies:** Epic 3 #1 Create member schema, Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `type:test`, `type:chore`, `epic:testing`
- **Estimated effort:** M (4-8h)

## Issue 7: Test organisation

- **Title:** Test organisation setup
- **Description:** Provision a dedicated test organisation (and test users with each role) for automated and manual testing.
- **Goal:** A consistent, isolated org/users for tests.
- **Acceptance criteria:**
  - [ ] A documented process/script creates a test org and users for each role.
  - [ ] Credentials/config available to CI securely.
  - [ ] Isolated from production data.
  - [ ] Reset/teardown documented.
- **Technical notes:** Coordinate Clerk test users with Convex sync (Epic 2 #3/#4). Store secrets in CI, not the repo. Underpins Epic 15 #4.
- **Dependencies:** Epic 2 #4 Sync Clerk organisations to Convex, Epic 15 #6 Seed data
- **Labels:** `area:backend`, `area:auth`, `type:test`, `type:chore`, `epic:testing`
- **Estimated effort:** S (2-4h)

## Issue 8: Accessibility checks

- **Title:** Accessibility checks
- **Description:** Add automated accessibility checks (e.g. axe) to component/E2E tests and document manual a11y expectations.
- **Goal:** The web app meets baseline accessibility and regressions are caught.
- **Acceptance criteria:**
  - [ ] Automated a11y assertions integrated into component and/or E2E tests.
  - [ ] Key pages pass with no critical violations.
  - [ ] Manual a11y guidance documented (keyboard nav, contrast, labels).
  - [ ] Runs in CI.
- **Technical notes:** Use axe-core via Testing Library or Playwright. Target WCAG AA basics for MVP. Builds on the component library (Epic 1 #5).
- **Dependencies:** Epic 15 #3 Frontend component tests
- **Labels:** `area:web`, `type:test`, `epic:testing`
- **Estimated effort:** S (2-4h)

## Issue 9: Linting

- **Title:** Linting setup
- **Description:** Configure ESLint with TypeScript and React rules across the workspace.
- **Goal:** Consistent lint rules enforced locally and in CI.
- **Acceptance criteria:**
  - [ ] ESLint configured with TS/React/import rules.
  - [ ] `pnpm lint` runs across packages and passes on the scaffold.
  - [ ] Integrated into CI (Epic 1 #10).
  - [ ] Editor integration documented.
- **Technical notes:** Include Convex-aware rules where helpful. Keep the config shared with per-package overrides.
- **Dependencies:** Epic 1 #2 Configure TypeScript, Epic 1 #10 Add CI workflow
- **Labels:** `area:web`, `area:backend`, `type:chore`, `epic:testing`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 10: Formatting

- **Title:** Formatting setup
- **Description:** Configure Prettier (and Swift formatting for iOS) with a shared config and pre-commit/CI enforcement.
- **Goal:** Consistent code formatting across the codebase.
- **Acceptance criteria:**
  - [ ] Prettier configured for JS/TS/CSS/MD with a shared config.
  - [ ] `pnpm format` and a check mode (`format:check`) available.
  - [ ] iOS formatting (e.g. swift-format/SwiftLint) configured.
  - [ ] Format check runs in CI.
- **Technical notes:** Ensure Prettier and ESLint do not conflict (use eslint-config-prettier). Consider a pre-commit hook (lint-staged).
- **Dependencies:** Epic 15 #9 Linting
- **Labels:** `area:web`, `area:ios`, `type:chore`, `epic:testing`, `good-first-issue`
- **Estimated effort:** S (2-4h)
