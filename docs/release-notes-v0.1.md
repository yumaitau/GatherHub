# GatherHub v0.1 — Release Notes (draft)

**GatherHub v0.1** is the first MVP release: a complete operating system for
community sports clubs, built on Convex + Clerk with a React web app and an iOS
field-ops scaffold.

## What's included

### Core platform

- Clerk authentication with **organisations** for multi-tenancy.
- Automatic sync of users, organisations, and memberships into Convex.
- Seven-tier **role model** with server-enforced permissions and strict
  per-organisation data isolation.

### Modules

- **Members** — profiles, guardians, emergency contacts, active/inactive
  status, CSV export.
- **Teams** — creation, rosters, player/coach/manager assignment.
- **Events & attendance** — training/match/meeting events, RSVPs, attendance
  recording and export, upcoming-events dashboard.
- **Announcements** — org-wide and team announcements, pinning, read tracking.
- **KitTrace** — first-class asset tracking across 11 categories and 6 statuses,
  with check-out/in/transfer/lost/maintenance/retire operations and an
  **immutable audit log**; overdue and lost views.
- **QR & NFC** — opaque tag ids, QR generation + printing, in-browser and iOS
  scanning, NFC-ready data model, and a **safe public landing page** that never
  exposes private data.
- **Volunteers** — skills, certifications with expiry tracking and a dashboard
  for expiring certs.
- **Sponsors** — logos (file upload), value, dates, asset links, public
  visibility, total-value reporting.
- **Public website** — per-club site (home, about, teams, sponsors, news,
  contact) generated from your data.
- **Dashboard** — at-a-glance widgets and recent audit activity.

### Mobile

- SwiftUI **iOS scaffold** with Clerk auth, Convex client, QR (AVFoundation) and
  NFC (Core NFC) scanning, and asset check-out/in flows.

### Documentation

- Architecture, data model, security model, mobile architecture, KitTrace, and a
  165-issue roadmap across 16 epics, plus deployment, user, and contribution
  guides.

## Out of scope (by design)

- No chat / messaging.
- No payments.
- No AI features.

## Known limitations

- The web QR scanner relies on the browser `BarcodeDetector` API (Chromium);
  other browsers use the manual entry fallback or the iOS app.
- The iOS app requires adding the Clerk iOS and Convex Swift SDK packages in
  Xcode before it compiles.
- Clerk org roles are mapped to GatherHub roles on first sync only; ongoing role
  management happens in-app (Settings → Members & roles).

## Upgrade / install

See the [README](../README.md) quick start and the
[deployment guide](deployment.md).
