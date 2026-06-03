# GatherHub Issue Roadmap

GatherHub is an open-source management platform for community sports clubs: members, teams, events and attendance, announcements, KitTrace asset tracking (with QR/NFC), volunteers, sponsors, a public website, and an iOS app. The backend is Convex; the web app is Vite + React + TypeScript + Tailwind with a shadcn-style component library on React Router; authentication is Clerk with organisations for multi-tenancy; the iOS app is SwiftUI using the Clerk iOS SDK and the Convex Swift client.

This directory holds the MVP roadmap, organised into 16 epics. Each epic file lists its issues with a consistent template: Title, Description, Goal, Acceptance criteria (checkboxes), Technical notes, Dependencies, Labels, and Estimated effort. There are 165 issues in total across the 16 epics.

## Epics

1. [Epic 1: Project Foundation](./epic-01-project-foundation.md) — Monorepo, TypeScript, Vite + React, Tailwind, component library, Convex, Clerk, env docs, local dev, and CI. The scaffolding every other epic builds on. (10 issues)
2. [Epic 2: Auth & Multi-Tenancy](./epic-02-auth-multi-tenancy.md) — Clerk login and org switching, user/org sync to Convex, the role model, auth guards, org-scoped queries, invitations, profile, and access-denied states. (10 issues)
3. [Epic 3: Members & Teams](./epic-03-members-and-teams.md) — Member records (guardians, emergency contacts) and teams with rosters and coach assignments. (11 issues)
4. [Epic 4: Events & Attendance](./epic-04-events-and-attendance.md) — Events (training/match/meeting), RSVP, attendance tracking, team-specific events, dashboard card, and export. (10 issues)
5. [Epic 5: Announcements](./epic-05-announcements.md) — Org and team announcements with pinning, read/unread tracking, and permissions. (7 issues)
6. [Epic 6: KitTrace Asset Tracking](./epic-06-kittrace-asset-tracking.md) — Asset model: categories, status, condition, tag IDs, QR, NFC, custodian, location, value, and sponsor links, plus list/detail/form. (14 issues)
7. [Epic 7: Asset Operations & Audit Log](./epic-07-asset-operations-and-audit-log.md) — Immutable audit log and the operation mutations (check-out/in, transfer, lost, maintenance, retire), history, permissions, overdue/lost views, and export. (12 issues)
8. [Epic 8: QR & NFC Workflows](./epic-08-qr-and-nfc-workflows.md) — Public/authenticated lookup routes, web QR scanning, print and batch QR, NFC registration/lookup, safe fallbacks, permission checks, and tag reassignment. (10 issues)
9. [Epic 9: Volunteers](./epic-09-volunteers.md) — Volunteer fields, skills, certifications with expiry, expiring-cert dashboard, notes, and export. (8 issues)
10. [Epic 10: Sponsors](./epic-10-sponsors.md) — Sponsor model, list/detail/form, logo upload, value and date tracking, asset links, public visibility, and a basic report. (10 issues)
11. [Epic 11: Public Website](./epic-11-public-website.md) — Public org profile and home/about/teams/sponsors/contact pages, a news system, and public site settings. (10 issues)
12. [Epic 12: iOS App](./epic-12-ios-app.md) — SwiftUI app: Clerk auth, Convex Swift client, org selection, asset lookup, QR/NFC scanning, check-out/in, events, RSVP, and offline error states. (12 issues)
13. [Epic 13: Reporting & Dashboards](./epic-13-reporting-and-dashboards.md) — Admin dashboard and widgets (counts, events, assets, certs, sponsor value), shared CSV exports, and a basic audit report. (10 issues)
14. [Epic 14: Security & Compliance](./epic-14-security-and-compliance.md) — Security model docs, permission test helpers, isolation/role/audit-integrity tests, upload validation, safe public routes, dependency scanning, security headers, and a privacy policy template. (10 issues)
15. [Epic 15: Testing & Quality](./epic-15-testing-and-quality.md) — Unit, Convex, component, and Playwright tests, mobile smoke checklist, seed data, test org, accessibility checks, linting, and formatting. (10 issues)
16. [Epic 16: Documentation & Launch](./epic-16-documentation-and-launch.md) — README, self-hosting and hosted deployment guides, admin/KitTrace/iOS user guides, contribution guide, license notes, MVP release checklist, and v0.1 release notes. (10 issues)

## Label glossary

### Area labels

- `area:backend` — Convex schema, queries, mutations, actions, and webhooks.
- `area:web` — The Vite + React web application (UI, routing, components).
- `area:ios` — The SwiftUI iOS application.
- `area:auth` — Authentication, Clerk integration, roles, and multi-tenancy.
- `area:kittrace` — KitTrace asset tracking: assets, operations, audit log, QR/NFC.
- `area:docs` — Documentation and guides.

### Type labels

- `type:feature` — New user-facing functionality.
- `type:chore` — Tooling, configuration, and maintenance work with no direct user feature.
- `type:test` — Test code, harnesses, and quality automation.
- `type:security` — Security-sensitive work (isolation, permissions, hardening, privacy).
- `type:docs` — Documentation deliverables (used by the launch epic alongside `area:docs`).

### Epic labels

Each issue carries an epic label to group it: `epic:foundation`, `epic:auth`, `epic:members`, `epic:teams`, `epic:events`, `epic:announcements`, `epic:kittrace`, `epic:volunteers`, `epic:sponsors`, `epic:public-site`, `epic:ios`, `epic:reporting`, `epic:security`, `epic:testing`, `epic:launch`.

### Other labels

- `good-first-issue` — Well-scoped, low-context tasks suitable for new contributors.

## Estimated effort key

- **XS** — ~1-2 hours
- **S** — ~2-4 hours
- **M** — ~4-8 hours (about a day)
- **L** — ~1-2 days
- **XL** — multiple days

## Dependencies

Issues reference prerequisites using the form `Epic N #M Short title` (e.g. "Epic 1 #6 Configure Convex"). Use these to sequence work; in general the lower-numbered foundation, auth, and core-data epics should land before the features that depend on them.
