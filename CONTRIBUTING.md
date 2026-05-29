# Contributing to GatherHub

Thanks for your interest in improving GatherHub! This is an open-source MVP and
contributions of all sizes are welcome.

## Getting set up

Follow the [Quick start](README.md#quick-start) in the README to get the web app
and Convex backend running locally.

## Project conventions

- **Language:** TypeScript everywhere on the web; strict mode is on (no `any`,
  no unused locals).
- **Backend is authoritative:** all permission and tenant-isolation decisions
  live in Convex (`web/convex/lib/auth.ts`). The client never decides what a
  user is allowed to do — it only hides UI affordances for a better experience.
- **Org scoping:** every tenant-scoped query/mutation derives `orgId` from the
  authenticated user's Convex record (`users.activeOrgId`, validated against
  `memberships`) and re-checks that any document it touches belongs to that org
  (`assertSameOrg`). Never accept an `orgId` from the client, and never rely on
  a Clerk JWT claim for tenancy — clubs live in Convex.
- **Audit log is immutable:** asset operations append to `assetAuditLog`. There
  is no update/delete path for audit rows — keep it that way.
- **UI:** reuse the primitives in `web/src/components/ui/` and the shared
  helpers in `web/src/components/shared.tsx`. Match the style of existing pages.

## Workflow

1. Pick an issue from [`docs/issues/`](docs/issues/README.md) (or open one).
2. Create a branch.
3. Keep the app runnable and commit in logical chunks.
4. Run checks before pushing:

   ```bash
   npm run lint
   npm run format:check
   npm --workspace web run typecheck
   ```

5. Open a PR describing the change and linking the issue.

## Commit messages

Use clear, present-tense summaries (e.g. "Add asset transfer mutation"). Group
related changes.

## Code of conduct

Be kind and constructive. We're here to help volunteer-run clubs.
