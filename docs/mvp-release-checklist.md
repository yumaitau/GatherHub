# MVP Release Checklist (v0.1)

A pragmatic checklist for shipping GatherHub v0.1. See `roadmap.md` for the full
definition of done.

## Functionality

- [ ] Sign in / sign up via Clerk works; organisation create/switch works.
- [ ] New user + org are mirrored into Convex on first load.
- [ ] Members: create, list, search, edit, status, guardians, emergency
      contacts, delete.
- [ ] Teams: create, list, detail, assign players + coaches, deactivate.
- [ ] Events: create training/match/meeting, list upcoming, RSVP, attendance.
- [ ] Announcements: org + team, pin, read/unread.
- [ ] KitTrace: create asset, edit, list/filter, detail with QR.
- [ ] Asset ops: check out / in / transfer / lost / maintenance / retire, each
      writing to the immutable audit log; history view renders.
- [ ] QR: generate, print, scan (web BarcodeDetector + manual), public landing
      page shows only safe info.
- [ ] NFC: register tag id; iOS scan resolves to asset.
- [ ] Volunteers: flag, skills, certifications, expiring-cert dashboard.
- [ ] Sponsors: create, logo upload, value, link to assets, public visibility.
- [ ] Public site: enable, home/about/teams/sponsors/news/contact render at
      `/club/:slug`.
- [ ] Dashboard widgets reflect real counts.

## Security

- [ ] Every Convex query/mutation derives `orgId` from the session.
- [ ] Cross-org id access returns "not found" (isolation test passes).
- [ ] Role checks enforced server-side for all mutating operations.
- [ ] QR/NFC tags contain no private data; public lookup leaks nothing sensitive.
- [ ] File upload restricted to committee+; served URLs validated.
- [ ] Security headers configured at the host (see `deployment.md`).
- [ ] Dependency scan clean (`npm audit`, Dependabot).
- [ ] Privacy policy published (see `privacy-policy-template.md`).

## Quality

- [ ] `npm run lint` clean.
- [ ] `npm --workspace web run typecheck` clean.
- [ ] `npm run build` succeeds.
- [ ] Seed data loads and demo club is explorable.
- [ ] Core flows smoke-tested manually (and via any Playwright tests).
- [ ] iOS scaffold builds after adding SDK packages; scan → lookup works.

## Docs & launch

- [ ] README quick start verified end-to-end on a clean machine.
- [ ] Deployment guide verified for at least one host.
- [ ] Issue roadmap published.
- [ ] v0.1 release notes drafted and tagged.
- [ ] LICENSE (MIT) present.
