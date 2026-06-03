# Epic 2: Auth & Multi-Tenancy

This epic delivers authentication and multi-tenant isolation. Clerk handles user identity only; clubs, memberships, roles, and the active-club selection live entirely in Convex. Every query and mutation is authenticated, attributed to a user, scoped to a club, and gated by role — the security backbone every feature epic relies on.

## Issue 1: Implement Clerk login

- **Title:** Implement Clerk sign-in / sign-up UI
- **Description:** Add sign-in, sign-up, and sign-out flows using Clerk's prebuilt components, with redirects to the app after authentication.
- **Goal:** Users can authenticate and reach an authenticated shell; unauthenticated users are redirected to sign in.
- **Acceptance criteria:**
  - [ ] `/sign-in` and `/sign-up` routes render Clerk components.
  - [ ] Authenticated users are redirected to the app dashboard.
  - [ ] A sign-out control clears the session and returns to sign-in.
  - [ ] Protected routes redirect unauthenticated users to `/sign-in`.
- **Technical notes:** Use Clerk's `<SignIn>`/`<SignUp>` and `<SignedIn>/<SignedOut>` gates. Configure allowed redirect URLs in Clerk. Style to match the Tailwind theme via Clerk appearance options. Clerk's Organizations feature stays disabled — clubs are managed in-app.
- **Dependencies:** Epic 1 #7 Configure Clerk
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`
- **Estimated effort:** S (2-4h)

## Issue 2: Implement club switcher

- **Title:** Add club switcher
- **Description:** Allow users who belong to multiple clubs to switch the active club, updating `users.activeOrgId` in Convex and refreshing org-scoped data.
- **Goal:** The active club is explicit, switchable from the app shell, and drives all data queries.
- **Acceptance criteria:**
  - [ ] An in-app `<OrgSwitcher>` lives in the app header.
  - [ ] Switching calls `organizations.setActive`, which validates membership and patches `users.activeOrgId`.
  - [ ] Convex subscriptions re-run on switch and org-scoped views render the new club's data.
  - [ ] Users with one club see it pre-selected; users with none see Create/Join CTAs.
- **Technical notes:** Switcher uses Convex queries (`sync.myMemberships`) and mutations (`organizations.setActive`). No Clerk Organizations API is involved.
- **Dependencies:** Epic 2 #1 Implement Clerk login, Epic 2 #4 Implement clubs in Convex
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`
- **Estimated effort:** S (2-4h)

## Issue 3: Sync Clerk users to Convex

- **Title:** Sync Clerk users into Convex
- **Description:** On authentication (and via Clerk webhooks for updates), upsert a corresponding user record in Convex so the backend can reference users by a stable id.
- **Goal:** Every Clerk user has a mirrored Convex `users` record kept in sync.
- **Acceptance criteria:**
  - [ ] A `users` table stores Clerk subject id, name, email, avatar, and `activeOrgId`.
  - [ ] First authenticated call (via `sync.ensureFromClient`) upserts the user.
  - [ ] Clerk `user.created` / `user.updated` / `user.deleted` webhooks upsert/cascade-delete the record (deleting also removes the user's memberships).
  - [ ] Webhook signatures are verified.
- **Technical notes:** Convex HTTP action at `<CONVEX_SITE_URL>/clerk-webhook` with svix signature verification. Index `users` by Clerk subject id. Do **not** subscribe to `organization.*` / `organizationMembership.*` events.
- **Dependencies:** Epic 1 #6 Configure Convex, Epic 1 #7 Configure Clerk
- **Labels:** `area:auth`, `area:backend`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 4: Implement clubs in Convex

- **Title:** Implement Convex-native clubs and memberships
- **Description:** Build the club lifecycle (create, edit, leave) and per-user `memberships` entirely in Convex. Clerk is not consulted for clubs.
- **Goal:** Convex holds an authoritative `organizations` table and a `memberships` table linking users to clubs with a role; an in-app flow creates and manages both.
- **Acceptance criteria:**
  - [ ] `organizations` table stores name, slug, optional image, `createdBy`, `inviteCode`.
  - [ ] `memberships` table links `userId` ↔ `orgId` with `role`.
  - [ ] `organizations.create` makes the caller the owner and sets it as their active club.
  - [ ] `organizations.update` (admin+) edits name/slug/image with uniqueness checks.
  - [ ] `organizations.leave` deletes the caller's membership; last-owner cannot leave.
- **Technical notes:** Indexes: `by_slug`, `by_invite_code` on organizations; `by_org`, `by_user`, `by_org_and_user`, `by_user_and_org` on memberships. Slugs are unique when set.
- **Dependencies:** Epic 2 #3 Sync Clerk users to Convex
- **Labels:** `area:auth`, `area:backend`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 5: Implement role model

- **Title:** Implement role model (Owner/Admin/Committee/Coach/Volunteer/Parent/Player)
- **Description:** Define the GatherHub role taxonomy and the permissions each role grants, stored on memberships and used by auth guards.
- **Goal:** A documented, enforceable role enum with a permission matrix usable across the app.
- **Acceptance criteria:**
  - [ ] Role enum defined: Owner, Admin, Committee, Coach, Volunteer, Parent, Player.
  - [ ] A permission matrix maps roles to capabilities (manage members, manage assets, post announcements, etc.).
  - [ ] Role is stored on each membership; `roles.updateRole` lets admins promote/demote with the last-owner guard.
  - [ ] Helper functions (`hasAtLeastRole`, `requireRole`, `requireAnyRole`) return whether a member has a given capability.
- **Technical notes:** Keep capabilities coarse for MVP but model them as named permissions, not raw role checks, so future roles compose. Owner is a superset of Admin. Coach scope is team-limited where applicable (Epic 3).
- **Dependencies:** Epic 2 #4 Implement clubs in Convex
- **Labels:** `area:auth`, `area:backend`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 6: Add Convex auth guards

- **Title:** Add Convex authentication guards
- **Description:** Provide shared helpers that every Convex query/mutation uses to assert the caller is authenticated and to load their identity/membership.
- **Goal:** A reusable guard that rejects unauthenticated calls and surfaces the current user, active club, and role.
- **Acceptance criteria:**
  - [ ] A `requireUser(ctx)` helper returns the Convex user or throws.
  - [ ] A `requireOrgMember(ctx)` helper resolves `activeOrgId` and returns the membership/role or throws typed errors (`unauthenticated`, `no_active_org`, `not_member`).
  - [ ] `requireRole(ctx, min)` / `requireAnyRole(ctx, [...])` extend the above with role gating.
  - [ ] `assertSameOrg` rejects fetched documents whose `orgId` is not the caller's, conflating cross-tenant ids with "not found".
- **Technical notes:** Read identity via `ctx.auth.getUserIdentity()`, then look up the Convex user by `clerkUserId` and the active club via `users.activeOrgId`. Errors carry a typed `code` so the frontend can map to UI states in Issue 10.
- **Dependencies:** Epic 2 #5 Implement role model
- **Labels:** `area:auth`, `area:backend`, `type:security`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 7: Add organisation-scoped queries

- **Title:** Enforce organisation-scoped queries
- **Description:** Ensure all data access filters by the caller's active club, preventing cross-tenant reads/writes.
- **Goal:** Queries and mutations only ever touch data belonging to the caller's club.
- **Acceptance criteria:**
  - [ ] A standard pattern/helper scopes reads to the server-derived `orgId`.
  - [ ] Mutations validate that target records belong to the caller's club.
  - [ ] Sample functions demonstrate scoping and reject cross-org access.
  - [ ] Indexes exist to query efficiently by `orgId`.
- **Technical notes:** `orgId` always comes from `requireOrgMember`/`requireRole` — never from a client-supplied argument. This is the foundation for the isolation tests in Epic 14 #3.
- **Dependencies:** Epic 2 #6 Add Convex auth guards
- **Labels:** `area:auth`, `area:backend`, `type:security`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 8: Add invitation flow

- **Title:** Implement club invitation flow
- **Description:** Let Owners/Admins share a rotating, opaque invite code that anyone signed in can use to join the club. Email-based invites are a follow-up.
- **Goal:** Admins can hand a code to a prospective member; the member joins by entering it and lands in the club as a `player`.
- **Acceptance criteria:**
  - [ ] `organizations.rotateInviteCode` (admin+) sets/rotates `organizations.inviteCode`.
  - [ ] `organizations.getInviteCode` returns the current code to admins+ only.
  - [ ] `organizations.joinByCode` accepts a code, creates the membership (default role `player`), and sets the club as the joiner's active org.
  - [ ] Invalid/expired codes return a typed error; the in-app `<OrgSwitcher>` renders it cleanly.
  - [ ] Non-admins cannot read the code or rotate it.
- **Technical notes:** Codes are opaque short strings indexed by `by_invite_code`. Initial role is `player`; admins promote via `roles.updateRole`. Email-based invites and revocable per-recipient links are deferred.
- **Dependencies:** Epic 2 #4 Implement clubs in Convex, Epic 2 #5 Implement role model, Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`
- **Estimated effort:** M (4-8h)

## Issue 9: Add user profile page

- **Title:** Add user profile page
- **Description:** Provide a page where the signed-in user can view and edit their profile (name, avatar) and see their club memberships and roles.
- **Goal:** Users can manage their own profile and understand their access.
- **Acceptance criteria:**
  - [ ] Profile page shows name, email, avatar, and club memberships with roles.
  - [ ] Editable identity fields (name, email, password, MFA) are delegated to Clerk's `<UserProfile>`; changes reflect in Convex after the next `user.updated` webhook or client sync.
  - [ ] A "Switch to" action on each membership calls `organizations.setActive`.
  - [ ] Page requires authentication.
- **Technical notes:** Reuse Clerk's `<UserProfile>` for identity-only fields. Supplement with `sync.myMemberships` (Convex) for the club list.
- **Dependencies:** Epic 2 #3 Sync Clerk users to Convex, Epic 2 #4 Implement clubs in Convex
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 10: Add access denied states

- **Title:** Add access denied and empty-club states
- **Description:** Provide consistent UI for forbidden actions, unauthenticated access, and the "you belong to no club" case.
- **Goal:** Users see clear, friendly messaging instead of broken pages when access is denied.
- **Acceptance criteria:**
  - [ ] A reusable Access Denied component is shown when a guard rejects a forbidden action.
  - [ ] A "no club" screen prompts the user to create a club or join one with an invite code, rendered by `<OrgSwitcher>`.
  - [ ] Backend errors map to the correct UI via the typed `code` (`unauthenticated` / `no_active_org` / `not_member` / `forbidden` / `not_found`).
  - [ ] States are reachable in a manual walkthrough.
- **Technical notes:** Map the typed `ConvexError` codes from Issue 6 to UI. Avoid leaking whether a record exists when access is forbidden (`not_found` is used for both absent and cross-tenant rows).
- **Dependencies:** Epic 2 #6 Add Convex auth guards, Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:auth`, `area:web`, `type:feature`, `epic:auth`, `good-first-issue`
- **Estimated effort:** S (2-4h)
