# GatherHub User Guide

A practical guide for club committees, coaches, and volunteers using GatherHub.

## Getting started

1. Open the app and sign in (or sign up) with your email.
2. **Create your club**: use the organisation switcher in the top bar →
   "Create organisation". This is your club / tenant.
3. Invite others from Clerk's organisation management. New members appear in
   **Settings → Members & roles**, where an owner/admin assigns their GatherHub
   role.

## Roles

| Role        | Typical use                                                        |
| ----------- | ------------------------------------------------------------------ |
| Owner       | Club founder; full control, manages owners.                        |
| Admin       | Full control except sole-owner protections.                        |
| Committee   | Manages teams, sponsors, news, public site, announcements.         |
| Coach       | Manages their members, events, attendance, team announcements, kit.|
| Volunteer   | Can run kit/asset operations in the field.                         |
| Parent      | Views relevant info; RSVPs for dependents.                         |
| Player      | Views relevant info; RSVPs.                                        |

Permissions are enforced on the server; the UI hides actions you can't perform.

## Members

- **Members** lists everyone in the club. Search and filter by status.
- Open a member to edit details, set active/inactive, add **guardians** and
  **emergency contacts**, and record **certifications**.

## Teams

- Create teams with an age group and season.
- On a team's page, assign members as **players**, **coaches**, or **managers**.
- Deactivate a team to hide it from the public site without deleting history.

## Events & attendance

- Create **training**, **match**, or **meeting** events; optionally tie an event
  to a team (org-wide otherwise).
- Members RSVP **going / maybe / not going**.
- Coaches record **attendance** on the event page and can export it to CSV.

## Announcements

- Post club-wide (committee+) or team announcements (coach+).
- Pin important notices; members' read status is tracked.

## KitTrace (assets)

See the dedicated [KitTrace guide](kittrace.md) for the full lifecycle. In short:

1. **Add an asset** — it's minted a QR tag id immediately.
2. **Print the QR** from the asset's QR/NFC tab and stick it on the item.
3. **Check out** to a custodian (optionally with a due-back date), **check in**
   when returned, **transfer** between people, or flag **lost / maintenance /
   retired**.
4. Every action is recorded in the asset's **immutable history**.
5. **Scan** a QR (Scan page or iOS app) to jump straight to an asset.

The dashboard surfaces checked-out, overdue, and lost counts.

## Volunteers

- Flag members as volunteers and record their skills.
- Add **certifications** with expiry dates. The Volunteers page highlights
  certifications that are expired or expiring within 60 days.

## Sponsors

- Add sponsors with a logo, contact, value, and dates.
- Link sponsors to the assets they funded.
- Toggle **public visibility** to feature them on the club website.

## Public website

- In **Settings → Public website**, enable the site and fill in the tagline,
  about text, and contact details.
- Your site goes live at `/club/<your-club-slug>` showing active teams,
  published news, and public sponsors.
- Publish news from the **News** section.

## Tips

- Use the **Export** buttons (members, assets, attendance, volunteers) for CSV
  reports.
- The **Scan** page works best in Chromium browsers; otherwise paste a tag link
  or use the iOS app.
