# Epic 16: Documentation & Launch

This epic produces the documentation and process needed to ship GatherHub's MVP as a credible open-source project: README, self-hosting and hosted deployment guides, admin/KitTrace/iOS user guides, a contribution guide, license notes, an MVP release checklist, and v0.1 release notes. It depends on the features and security/testing work landing across all prior epics.

## Issue 1: README

- **Title:** Write the project README
- **Description:** Author a comprehensive README introducing GatherHub, its features, tech stack, quick start, and links to deeper docs.
- **Goal:** A newcomer understands what GatherHub is and how to get started in minutes.
- **Acceptance criteria:**
  - [ ] Overview, feature summary, screenshots/diagram, and tech stack.
  - [ ] Quick start linking to local dev (Epic 1 #9).
  - [ ] Links to deployment, user, and contribution guides.
  - [ ] License and project status badges.
- **Technical notes:** Keep it concise with links rather than duplicating guides. Update badges to reflect CI status.
- **Dependencies:** Epic 1 #9 Add local development instructions
- **Labels:** `area:docs`, `type:docs`, `epic:launch`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 2: Self-hosting guide

- **Title:** Self-hosting guide
- **Description:** Document how to self-host GatherHub: provisioning Convex, Clerk, environment configuration, and building/deploying the web app.
- **Goal:** A technical operator can self-host GatherHub end to end.
- **Acceptance criteria:**
  - [ ] Steps to set up Convex and Clerk projects.
  - [ ] Environment configuration referencing the env doc (Epic 1 #8).
  - [ ] Web app build and static hosting steps, including security headers (Epic 14 #9).
  - [ ] Verified by a dry run.
- **Technical notes:** Cover production vs dev deployments and webhook configuration (Epic 2 #3/#4). Note iOS distribution separately (Issue 6).
- **Dependencies:** Epic 1 #8 Add environment variable documentation, Epic 14 #9 Security headers
- **Labels:** `area:docs`, `type:docs`, `epic:launch`
- **Estimated effort:** M (4-8h)

## Issue 3: Hosted deployment guide

- **Title:** Hosted deployment guide
- **Description:** Document the recommended hosted deployment path (e.g. Convex Cloud + a static host) including CI/CD.
- **Goal:** Operators can deploy the hosted reference setup reliably.
- **Acceptance criteria:**
  - [ ] Step-by-step hosted deployment with the recommended providers.
  - [ ] CI/CD deployment notes (build, deploy, env/secrets).
  - [ ] Domain, HTTPS, and headers guidance.
  - [ ] Verified by a deployment.
- **Technical notes:** Reuse the self-hosting env section; focus on the managed-provider specifics and pipeline. Reference Epic 1 #10 CI.
- **Dependencies:** Epic 16 #2 Self-hosting guide, Epic 1 #10 Add CI workflow
- **Labels:** `area:docs`, `type:docs`, `epic:launch`
- **Estimated effort:** M (4-8h)

## Issue 4: Admin user guide

- **Title:** Admin user guide
- **Description:** A guide for club admins covering orgs, members, teams, events, announcements, volunteers, sponsors, and the dashboard.
- **Goal:** Admins can operate GatherHub without developer help.
- **Acceptance criteria:**
  - [ ] Covers inviting users/roles, managing members/teams, events/attendance, announcements, volunteers, sponsors.
  - [ ] Explains the dashboard and exports.
  - [ ] Includes screenshots and common tasks.
  - [ ] Reviewed for accuracy against the app.
- **Technical notes:** Organise by task. Cross-link the KitTrace guide (Issue 5) for assets. Keep screenshots current.
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 2 #8 Add invitation flow
- **Labels:** `area:docs`, `type:docs`, `epic:launch`
- **Estimated effort:** M (4-8h)

## Issue 5: KitTrace user guide

- **Title:** KitTrace user guide
- **Description:** A guide covering asset management: creating assets, tags/QR/NFC, operations, the audit log, and reports.
- **Goal:** Users can manage assets and tags confidently.
- **Acceptance criteria:**
  - [ ] Covers creating assets, generating/printing QR, registering NFC, and batch tagging.
  - [ ] Explains check-out/in, transfer, lost, maintenance, retire, and the audit log.
  - [ ] Covers overdue/lost views and asset export.
  - [ ] Includes screenshots and field-use tips (mobile scanning).
- **Technical notes:** Cross-link the iOS guide (Issue 6) for field scanning. Reference Epics 6-8.
- **Dependencies:** Epic 7 #8 Display asset history, Epic 8 #4 QR print layout
- **Labels:** `area:docs`, `area:kittrace`, `type:docs`, `epic:launch`
- **Estimated effort:** M (4-8h)

## Issue 6: iOS app guide

- **Title:** iOS app guide
- **Description:** A guide for installing and using the iOS app, focused on field scanning and asset operations.
- **Goal:** Users can install and use the iOS app effectively.
- **Acceptance criteria:**
  - [ ] Installation/distribution instructions (TestFlight or build steps).
  - [ ] Sign-in, org selection, scanning (QR/NFC), and check-out/in walkthroughs.
  - [ ] Permissions (camera/NFC) and troubleshooting.
  - [ ] Screenshots included.
- **Technical notes:** Note device requirements (NFC-capable). Reference Epic 12 features and the smoke checklist (Epic 15 #5).
- **Dependencies:** Epic 12 #1 SwiftUI app project, Epic 12 #8 Asset check-out flow
- **Labels:** `area:docs`, `area:ios`, `type:docs`, `epic:launch`
- **Estimated effort:** S (2-4h)

## Issue 7: Contribution guide

- **Title:** Contribution guide
- **Description:** A CONTRIBUTING document covering how to set up, branch, test, and submit PRs, plus code standards and the issue/epic structure.
- **Goal:** New contributors can confidently contribute.
- **Acceptance criteria:**
  - [ ] Setup, branching, commit, and PR conventions documented.
  - [ ] Testing, linting, and formatting expectations stated (Epic 15).
  - [ ] Code of conduct referenced and label glossary linked.
  - [ ] Good-first-issue guidance included.
- **Technical notes:** Link to the issues README/label glossary. Reference CI requirements (Epic 1 #10).
- **Dependencies:** Epic 1 #9 Add local development instructions, Epic 15 #9 Linting
- **Labels:** `area:docs`, `type:docs`, `epic:launch`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 8: Open-source license notes

- **Title:** Open-source license and notices
- **Description:** Choose and document the project license and third-party notices.
- **Goal:** The project has a clear license and complies with dependency licensing.
- **Acceptance criteria:**
  - [ ] LICENSE file present with the chosen OSI license.
  - [ ] Third-party/notice attributions documented as required.
  - [ ] License referenced in README and package metadata.
  - [ ] Any trademark/branding notes documented.
- **Technical notes:** Pick a permissive or copyleft license deliberately; ensure compatibility with dependencies. Document any name/logo usage rules.
- **Dependencies:** Epic 16 #1 README
- **Labels:** `area:docs`, `type:docs`, `epic:launch`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 9: MVP release checklist

- **Title:** MVP release checklist
- **Description:** A checklist gating the v0.1 release: features complete, tests/security passing, docs ready, and deployment verified.
- **Goal:** A clear, repeatable gate before tagging the MVP release.
- **Acceptance criteria:**
  - [ ] Checklist covers feature completeness across epics, green CI, security tests passing, and docs published.
  - [ ] Includes the iOS smoke checklist (Epic 15 #5).
  - [ ] Includes deployment verification and rollback notes.
  - [ ] Used to gate the v0.1 release.
- **Technical notes:** Reference Epics 14 and 15 outcomes. Keep it a living checklist for future releases.
- **Dependencies:** Epic 14 #1 Document security model, Epic 15 #5 Mobile smoke test checklist
- **Labels:** `area:docs`, `type:docs`, `epic:launch`
- **Estimated effort:** S (2-4h)

## Issue 10: v0.1 release notes

- **Title:** v0.1 release notes
- **Description:** Author the v0.1 release notes summarising features, known limitations, and upgrade/setup pointers.
- **Goal:** A clear, public summary of what the MVP delivers.
- **Acceptance criteria:**
  - [ ] Highlights features by area (members, events, KitTrace, sponsors, public site, iOS).
  - [ ] Lists known limitations and out-of-scope items.
  - [ ] Links to setup and user guides.
  - [ ] Published with the v0.1 tag.
- **Technical notes:** Generate from merged PRs/epics. Be honest about MVP limitations (e.g. offline scope, web NFC support).
- **Dependencies:** Epic 16 #9 MVP release checklist
- **Labels:** `area:docs`, `type:docs`, `epic:launch`, `good-first-issue`
- **Estimated effort:** S (2-4h)
