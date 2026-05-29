# Epic 14: Security & Compliance

This epic hardens GatherHub: documenting the security model, building permission test helpers, and verifying organisation isolation, role permissions, and audit-log integrity. It also covers file upload validation, safe public routes, dependency scanning, security headers, and a privacy policy template. It depends on the auth foundation (Epic 2) and touches every data-handling epic.

## Issue 1: Document security model

- **Title:** Document the security model
- **Description:** Write a document describing the threat model, multi-tenancy isolation, roles/permissions, public vs private data, and the audit log's role.
- **Goal:** A clear, authoritative reference for how GatherHub enforces security.
- **Acceptance criteria:**
  - [ ] Documents tenancy isolation, the role/permission matrix, and data sensitivity tiers.
  - [ ] Describes public-route data exposure rules and the audit log's immutability.
  - [ ] Lists known limitations/assumptions for MVP.
  - [ ] Reviewed and linked from the README.
- **Technical notes:** Reference Epic 2 (auth), Epic 3 #7 (medical notes), Epic 7 #1 (audit). Keep it living; update as features land.
- **Dependencies:** Epic 2 #5 Implement role model, Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:docs`, `type:security`, `epic:security`
- **Estimated effort:** S (2-4h)

## Issue 2: Convex permission test helpers

- **Title:** Convex permission test helpers
- **Description:** Build reusable test utilities to set up users, orgs, memberships, and roles, and to invoke functions as a given identity.
- **Goal:** Permission tests are easy to write with realistic auth contexts.
- **Acceptance criteria:**
  - [ ] Helpers create test orgs, users, and memberships with roles.
  - [ ] Helpers invoke queries/mutations as a chosen identity.
  - [ ] Helpers assert allowed vs forbidden outcomes ergonomically.
  - [ ] Used by at least one test suite.
- **Technical notes:** Build on the Convex test harness. Mirror the auth guard expectations (Epic 2 #6). These helpers underpin Issues 3-5.
- **Dependencies:** Epic 2 #6 Add Convex auth guards, Epic 15 #2 Convex function tests
- **Labels:** `area:backend`, `type:test`, `type:security`, `epic:security`
- **Estimated effort:** M (4-8h)

## Issue 3: Organisation isolation tests

- **Title:** Organisation isolation tests
- **Description:** Tests proving that a user in one org cannot read or mutate another org's data across all major tables.
- **Goal:** Cross-tenant access is provably blocked.
- **Acceptance criteria:**
  - [ ] Tests cover members, teams, events, assets, sponsors, announcements.
  - [ ] Cross-org reads return nothing/denied; cross-org writes are rejected.
  - [ ] Public-route projections leak no cross-org data.
  - [ ] Tests run in CI.
- **Technical notes:** Use the permission helpers (Issue 2). Validate the scoping pattern from Epic 2 #7 and tag-lookup checks from Epic 8 #9.
- **Dependencies:** Epic 14 #2 Convex permission test helpers, Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `type:test`, `type:security`, `epic:security`
- **Estimated effort:** M (4-8h)

## Issue 4: Role permission tests

- **Title:** Role permission tests
- **Description:** Tests asserting each role's allowed/denied operations against the permission matrix.
- **Goal:** The role matrix is enforced and regression-protected.
- **Acceptance criteria:**
  - [ ] Tests cover key operations per role (manage members/teams/assets, view medical notes, post announcements, asset operations).
  - [ ] Both allowed and denied cases asserted.
  - [ ] Medical-note access restricted per matrix.
  - [ ] Tests run in CI.
- **Technical notes:** Drive from a table mapping role x operation to expected outcome, using the helpers (Issue 2). Covers Epic 3 #7 and Epic 7 #9.
- **Dependencies:** Epic 14 #2 Convex permission test helpers, Epic 2 #5 Implement role model
- **Labels:** `area:backend`, `type:test`, `type:security`, `epic:security`
- **Estimated effort:** M (4-8h)

## Issue 5: Asset audit integrity tests

- **Title:** Asset audit integrity tests
- **Description:** Tests verifying the audit log is append-only and accurately records each operation.
- **Goal:** Audit-log immutability and correctness are provably enforced.
- **Acceptance criteria:**
  - [ ] No exposed path can update or delete audit entries.
  - [ ] Each operation (check-out/in, transfer, lost, maintenance, retire) appends exactly one accurate entry.
  - [ ] Entries record actor, type, and from/to values correctly.
  - [ ] Tests run in CI.
- **Technical notes:** Verify the absence of mutate/delete APIs on the audit table and the atomicity of status+audit writes (Epic 7).
- **Dependencies:** Epic 14 #2 Convex permission test helpers, Epic 7 #1 Asset audit log schema
- **Labels:** `area:backend`, `area:kittrace`, `type:test`, `type:security`, `epic:security`
- **Estimated effort:** M (4-8h)

## Issue 6: File upload validation

- **Title:** File upload validation
- **Description:** Validate uploaded files (e.g. sponsor logos) for type, size, and safety server-side.
- **Goal:** Only safe, expected files are accepted and stored.
- **Acceptance criteria:**
  - [ ] Server-side validation of MIME type and size limits.
  - [ ] Rejects disallowed types with a clear error.
  - [ ] Validation cannot be bypassed by the client.
  - [ ] Covered by tests.
- **Technical notes:** Enforce in the Convex action handling uploads (Epic 10 #5). Consider stripping metadata and constraining image dimensions.
- **Dependencies:** Epic 10 #5 Sponsor logo upload
- **Labels:** `area:backend`, `type:security`, `epic:security`
- **Estimated effort:** S (2-4h)

## Issue 7: Safe public route checks

- **Title:** Safe public route checks
- **Description:** Audit and test all public (unauthenticated) routes/queries to ensure they expose only whitelisted, non-sensitive data.
- **Goal:** No public endpoint leaks private or cross-org data.
- **Acceptance criteria:**
  - [ ] Inventory of public queries/routes documented.
  - [ ] Each returns only an explicit whitelist of fields.
  - [ ] Tests assert sensitive fields are never present in public responses.
  - [ ] Unknown identifiers return uniform not-found (no enumeration).
- **Technical notes:** Covers public asset lookup (Epic 8 #1), public org/teams/sponsors/news (Epic 11), and public sponsors (Epic 10 #9). Validate projections, not filtered full records.
- **Dependencies:** Epic 8 #1 Public asset lookup route, Epic 11 #1 Public organisation profile
- **Labels:** `area:backend`, `area:web`, `type:test`, `type:security`, `epic:security`
- **Estimated effort:** M (4-8h)

## Issue 8: Dependency scanning

- **Title:** Dependency scanning
- **Description:** Add automated dependency vulnerability scanning to CI for JS and (where feasible) iOS dependencies.
- **Goal:** Known-vulnerable dependencies are flagged automatically.
- **Acceptance criteria:**
  - [ ] CI runs a dependency audit (e.g. `pnpm audit` and/or a scanning action).
  - [ ] High/critical findings fail or flag the build per policy.
  - [ ] A documented process for triaging findings exists.
  - [ ] Runs on PRs and a schedule.
- **Technical notes:** Consider enabling automated dependency update PRs. iOS SPM scanning is best-effort for MVP. Integrate with Epic 1 #10 CI.
- **Dependencies:** Epic 1 #10 Add CI workflow
- **Labels:** `area:backend`, `area:web`, `type:security`, `type:chore`, `epic:security`
- **Estimated effort:** S (2-4h)

## Issue 9: Security headers

- **Title:** Security headers
- **Description:** Configure HTTP security headers for the web app (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame options).
- **Goal:** The web app is served with hardened security headers.
- **Acceptance criteria:**
  - [ ] CSP, HSTS, X-Content-Type-Options, Referrer-Policy, and frame-ancestors configured.
  - [ ] CSP allows required origins (Convex, Clerk) without `unsafe-inline` where avoidable.
  - [ ] Headers verified on the deployed app.
  - [ ] Documented in the deployment guide.
- **Technical notes:** Apply at the hosting/CDN layer or via the static host config. Test CSP against Clerk/Convex requirements; iterate to avoid breakage.
- **Dependencies:** Epic 1 #3 Configure React frontend
- **Labels:** `area:web`, `type:security`, `epic:security`
- **Estimated effort:** S (2-4h)

## Issue 10: Privacy policy template

- **Title:** Privacy policy template
- **Description:** Provide a privacy policy template covering the personal data GatherHub processes (members, minors, medical notes, contacts) for clubs to adapt.
- **Goal:** Clubs have a starting privacy policy reflecting GatherHub's data handling.
- **Acceptance criteria:**
  - [ ] Template enumerates data categories collected and their purpose.
  - [ ] Addresses minors' data and sensitive medical information.
  - [ ] Covers retention, access, and data subject rights at a high level.
  - [ ] Clearly marked as a template requiring legal review.
- **Technical notes:** Not legal advice; provide placeholders for club-specific details. Align categories with the security model doc (Issue 1).
- **Dependencies:** Epic 14 #1 Document security model
- **Labels:** `area:docs`, `type:security`, `epic:security`, `good-first-issue`
- **Estimated effort:** S (2-4h)
