# Epic 2: Auth & Multi-Tenancy

This epic delivers authentication and multi-tenant isolation. Clerk handles identity and organisations; GatherHub mirrors users and organisations into Convex, applies a role model, and enforces organisation-scoped access at the data layer. The outcome is that every query and mutation is authenticated, attributed to a user, scoped to an organisation, and gated by role — the security backbone every feature epic relies on.

## Issue 1: Implement Clerk login

- **Title:** Implement Clerk sign-in / sign-up UI
- **Description:** Add sign-in, sign-up, and sign-out flows using Clerk's prebuilt components, with redirects to the app after authentication.
- **Goal:** Users can authenticate and reach an authenticated shell; unauthenticated users are redirected to sign in.
- **Acceptance criteria:**
  - [ ] `/sign-in` and `/sign-up` routes render Clerk components.
  - [ ] Authenticated users are redirected to the app dashboard.
  - [ ] A sign-out control clears the session and returns to sign-in.
  - [ ] Protected routes redirect unauthenticated users to `/sign-in`.
- **Technical notes:** Use Clerk's `<SignIn>`/`<SignUp>` and `<SignedIn>/<SignedOut>` gates. Configure allowed redirect URLs in Clerk. Style to match the Tailwind theme via Clerk appearance options.
- **Dependencies:** Epic 1 #7 Configure Clerk
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`
- **Estimated effort:** S (2-4h)

## Issue 2: Implement organisation switcher

- **Title:** Add organisation switcher
- **Description:** Allow users who belong to multiple organisations to switch the active organisation, updating the session and refreshing org-scoped data.
- **Goal:** The active organisation is explicit, switchable, and drives all data queries.
- **Acceptance criteria:**
  - [ ] An org switcher (Clerk `<OrganizationSwitcher>` or custom) is in the app header.
  - [ ] Switching organisations updates the active org in the session.
  - [ ] Org-scoped views re-query for the newly selected organisation.
  - [ ] Users with a single org see a sensible default (no forced selection).
- **Technical notes:** The active org id must propagate to Convex via the Clerk token claim. Ensure React Query/Convex subscriptions re-run on org change. Handle the "no organisation" state (see Issue 8 invitations).
- **Dependencies:** Epic 2 #1 Implement Clerk login
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`
- **Estimated effort:** S (2-4h)

## Issue 3: Sync Clerk users to Convex

- **Title:** Sync Clerk users into Convex
- **Description:** On authentication (and via Clerk webhooks for updates), upsert a corresponding user record in Convex so the backend can reference users by a stable id.
- **Goal:** Every Clerk user has a mirrored Convex `users` record kept in sync.
- **Acceptance criteria:**
  - [ ] A `users` table stores Clerk user id, name, email, and avatar.
  - [ ] First authenticated call (or webhook) upserts the user.
  - [ ] Clerk `user.updated`/`user.deleted` webhooks update/soft-delete the record.
  - [ ] Webhook signatures are verified.
- **Technical notes:** Prefer a Convex HTTP action endpoint for Clerk webhooks with signature verification. Index `users` by Clerk subject id. Avoid storing secrets in the user record.
- **Dependencies:** Epic 1 #6 Configure Convex, Epic 1 #7 Configure Clerk
- **Labels:** `area:auth`, `area:backend`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 4: Sync Clerk organisations to Convex

- **Title:** Sync Clerk organisations into Convex
- **Description:** Mirror Clerk organisations and memberships into Convex tables so data can be scoped per organisation and membership/role can be enforced server-side.
- **Goal:** Convex holds an authoritative `organisations` table and `memberships` linking users to orgs with roles.
- **Acceptance criteria:**
  - [ ] `organisations` table stores Clerk org id, name, slug, and metadata.
  - [ ] `memberships` table links user + org + role.
  - [ ] Clerk org/membership webhooks keep the tables in sync.
  - [ ] Webhook signatures are verified.
- **Technical notes:** Map Clerk org roles to GatherHub roles (Issue 5). Index `memberships` by org id and by user id. Handle membership removal (revoke access).
- **Dependencies:** Epic 2 #3 Sync Clerk users to Convex
- **Labels:** `area:auth`, `area:backend`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 5: Implement role model

- **Title:** Implement role model (Owner/Admin/Committee/Coach/Volunteer/Parent/Player)
- **Description:** Define the GatherHub role taxonomy and the permissions each role grants, stored on memberships and used by auth guards.
- **Goal:** A documented, enforceable role enum with a permission matrix usable across the app.
- **Acceptance criteria:**
  - [ ] Role enum defined: Owner, Admin, Committee, Coach, Volunteer, Parent, Player.
  - [ ] A permission matrix maps roles to capabilities (manage members, manage assets, view medical notes, etc.).
  - [ ] Role is stored on each membership and editable by Owner/Admin.
  - [ ] Helper functions return whether a member has a given capability.
- **Technical notes:** Keep capabilities coarse for MVP but model them as named permissions, not raw role checks, so future roles compose. Owner is a superset of Admin. Coach scope is team-limited where applicable (Epic 3).
- **Dependencies:** Epic 2 #4 Sync Clerk organisations to Convex
- **Labels:** `area:auth`, `area:backend`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 6: Add Convex auth guards

- **Title:** Add Convex authentication guards
- **Description:** Provide shared helpers that every Convex query/mutation uses to assert the caller is authenticated and to load their identity/membership.
- **Goal:** A reusable guard that rejects unauthenticated calls and surfaces the current user and membership.
- **Acceptance criteria:**
  - [ ] A `requireUser(ctx)` helper returns the Convex user or throws.
  - [ ] A `requireMembership(ctx, orgId)` helper returns the membership/role or throws.
  - [ ] Unauthenticated calls fail with a clear, typed error.
  - [ ] Helpers are unit-testable and used by sample functions.
- **Technical notes:** Read identity via `ctx.auth.getUserIdentity()`. Errors should be distinguishable (unauthenticated vs forbidden) for the frontend to map to states in Issue 10.
- **Dependencies:** Epic 2 #5 Implement role model
- **Labels:** `area:auth`, `area:backend`, `type:security`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 7: Add organisation-scoped queries

- **Title:** Enforce organisation-scoped queries
- **Description:** Ensure all data access filters by the caller's active organisation, preventing cross-tenant reads/writes.
- **Goal:** Queries and mutations only ever touch data belonging to the caller's organisation.
- **Acceptance criteria:**
  - [ ] A standard pattern/helper scopes reads to the active org id.
  - [ ] Mutations validate that target records belong to the caller's org.
  - [ ] Sample functions demonstrate scoping and reject cross-org access.
  - [ ] Indexes exist to query efficiently by org id.
- **Technical notes:** Derive org id from the verified membership, never trust a client-supplied org id without checking membership. This is the foundation for the isolation tests in Epic 14 #3.
- **Dependencies:** Epic 2 #6 Add Convex auth guards
- **Labels:** `area:auth`, `area:backend`, `type:security`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 8: Add invitation flow

- **Title:** Implement organisation invitation flow
- **Description:** Allow Owners/Admins to invite people to an organisation with a chosen role, using Clerk organisation invitations.
- **Goal:** Admins can invite members by email and the invitee joins with the correct role.
- **Acceptance criteria:**
  - [ ] Admins can send an invite specifying email and role.
  - [ ] Pending invites are listed with revoke capability.
  - [ ] Accepting an invite creates membership with the assigned role (synced to Convex).
  - [ ] Non-admins cannot send invites.
- **Technical notes:** Use Clerk organisation invitations; map the invited Clerk role to a GatherHub role on acceptance via webhook (Issue 4). Validate role assignment against the caller's permissions.
- **Dependencies:** Epic 2 #5 Implement role model, Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 9: Add user profile page

- **Title:** Add user profile page
- **Description:** Provide a page where the signed-in user can view and edit their profile (name, avatar) and see their organisation memberships and roles.
- **Goal:** Users can manage their own profile and understand their access.
- **Acceptance criteria:**
  - [ ] Profile page shows name, email, avatar, and org memberships with roles.
  - [ ] Editable fields update via Clerk and reflect in Convex after sync.
  - [ ] Password/security settings link to Clerk's account management.
  - [ ] Page requires authentication.
- **Technical notes:** Reuse Clerk's `<UserProfile>` where convenient; supplement with GatherHub-specific membership info pulled from Convex.
- **Dependencies:** Epic 2 #3 Sync Clerk users to Convex
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 10: Add access denied states

- **Title:** Add access denied and empty-org states
- **Description:** Provide consistent UI for forbidden actions, unauthenticated access, and the "you belong to no organisation" case.
- **Goal:** Users see clear, friendly messaging instead of broken pages when access is denied.
- **Acceptance criteria:**
  - [ ] A reusable Access Denied component is shown when a guard rejects a forbidden action.
  - [ ] A "no organisation" screen prompts the user to accept an invite or create an org (if allowed).
  - [ ] Backend forbidden vs unauthenticated errors map to the correct UI.
  - [ ] States are reachable in a manual walkthrough.
- **Technical notes:** Map the typed Convex errors from Issue 6 to UI. Avoid leaking whether a record exists when access is forbidden.
- **Dependencies:** Epic 2 #6 Add Convex auth guards, Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`, `good-first-issue`
- **Estimated effort:** S (2-4h)
