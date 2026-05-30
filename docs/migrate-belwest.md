# Migrate Belwest soccer registration data into GatherHub

One-shot migration that reads a Convex export from the legacy
`belwest-soccer-registration-system` deployment and writes it into a
GatherHub Convex deployment. Idempotent on the dedupe keys called out
in each section; safe to re-run if a single batch fails.

## What gets mapped

| Belwest | GatherHub |
| --- | --- |
| `players` | `members` (firstName, lastName, email, phone, dob) + `soccerRegistrations` sidecar (FFA, gender, school, paid, payment plan, team/competition/division links) |
| `teams` | `teams` (with `kitColour`, `kitBagNumber`) |
| `competitions` | `soccerCompetitions` |
| `ageGroups` | `taxonomies` kind `team_age_group` |
| `divisions` | `soccerDivisions` (grade bands default to 0..100; set explicit ranges in Settings → Soccer afterwards) |
| `clubContacts` | `members` (volunteer flagged) + `soccerWwvp` (background-check status) |
| `lifetimeMembers` | `members` with `isLifetimeMember = true` |

Members deduped by lowercase email. Teams, competitions, divisions
deduped by name. Lifetime-member match falls back to (firstName,
lastName).

## Prerequisites

- The owner email you'll use has signed in to GatherHub at least once
  (so a `users` row exists for it).
- Soccer mode will be enabled automatically by the script.
- For a non-dev target deployment, have a Convex deploy key ready and
  expose it as `CONVEX_DEPLOY_KEY` in the shell.

## Step by step

```bash
# 1. Dump the source deployment
cd ../belwest-soccer-registration-system
npx convex export --path ./belwest-dump.zip
unzip belwest-dump.zip -d belwest-dump

# 2. From the GatherHub repo root, dry-run first
cd ../GatherHub
node tools/migrate-belwest.mjs \
  --dump ../belwest-soccer-registration-system/belwest-dump \
  --owner-email you@example.com \
  --dry-run

# 3. Real run
node tools/migrate-belwest.mjs \
  --dump ../belwest-soccer-registration-system/belwest-dump \
  --owner-email you@example.com \
  --name "Belwest Soccer Club" \
  --slug belwest
```

`tools/migrate-belwest.mjs --help` lists every flag.

## After

- Switch to the new org in the GatherHub UI (workspace switcher).
- `/registrations` lists every imported player with rego/paid/plan
  badges.
- Settings → Soccer → Divisions: tighten grade bands (the import
  leaves them as 0..100 placeholders).
- Members list now includes lifetime members. Filter by the new
  `isLifetimeMember` flag (UI surface coming next).

## Cleanup

Once you're satisfied with the import you can drop the migration
module:

```bash
git rm web/convex/migrations/belwest.ts
git rm tools/migrate-belwest.mjs
```

Push and the import endpoints disappear from the deployment.
