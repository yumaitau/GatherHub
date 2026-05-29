# Epic 3: Members & Teams

This epic delivers the core people-management features: member records (with guardians, emergency contacts, and restricted medical notes) and teams (with rosters and coach assignments). All data is organisation-scoped and role-gated per Epic 2. Members and teams underpin events/attendance, announcements, volunteers, and reporting in later epics.

## Issue 1: Create member schema

- **Title:** Define member schema
- **Description:** Create the Convex `members` table capturing identity, contact details, membership status, and timestamps, scoped to an organisation.
- **Goal:** A typed, indexed `members` table ready for CRUD and relationships.
- **Acceptance criteria:**
  - [ ] `members` table includes org id, full name, date of birth, contact email/phone, status (active/inactive), and created/updated timestamps.
  - [ ] Indexed by org id and by status.
  - [ ] Optional link to a Convex user record for members who log in.
  - [ ] Schema validates required fields.
- **Technical notes:** Keep medical and guardian data in separate fields/tables (Issues 5-7) to allow restricted visibility. DOB drives minor detection for guardian requirements.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `type:feature`, `epic:members`
- **Estimated effort:** S (2-4h)

## Issue 2: Member list page

- **Title:** Member list page
- **Description:** A paginated, searchable, filterable table of members for the active organisation.
- **Goal:** Staff can browse, search, and filter members efficiently.
- **Acceptance criteria:**
  - [ ] Table shows name, status, team(s), and contact summary.
  - [ ] Search by name and filter by status/team.
  - [ ] Pagination or virtualised loading for large lists.
  - [ ] Row click navigates to member detail.
- **Technical notes:** Use the shadcn-style Table. Query is org-scoped (Epic 2 #7). Avoid exposing medical notes in the list.
- **Dependencies:** Epic 3 #1 Create member schema, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `type:feature`, `epic:members`
- **Estimated effort:** M (4-8h)

## Issue 3: Member detail page

- **Title:** Member detail page
- **Description:** A read view of a single member showing profile, contacts, teams, guardians, emergency contacts, and (if permitted) medical notes.
- **Goal:** A complete, role-aware single-member overview.
- **Acceptance criteria:**
  - [ ] Displays profile, contact, status, and team memberships.
  - [ ] Shows guardian and emergency contact info.
  - [ ] Medical notes section only renders for permitted roles.
  - [ ] Edit and assign actions are visible per role.
- **Technical notes:** Compose data from members, guardians, emergency contacts, and medical notes. Gate medical section using the permission helper (Epic 2 #5).
- **Dependencies:** Epic 3 #1 Create member schema, Epic 3 #5 Guardian relationships, Epic 3 #6 Emergency contact fields, Epic 3 #7 Medical notes with restricted visibility
- **Labels:** `area:web`, `type:feature`, `epic:members`
- **Estimated effort:** M (4-8h)

## Issue 4: Member edit form

- **Title:** Member create/edit form
- **Description:** A validated form to create and edit member records.
- **Goal:** Staff can add and update members with validation and clear errors.
- **Acceptance criteria:**
  - [ ] Create and edit share a validated form (required name, valid email/phone formats).
  - [ ] Submitting calls org-scoped create/update mutations.
  - [ ] Validation errors are shown inline.
  - [ ] Only permitted roles can create/edit.
- **Technical notes:** Use a schema validation library (e.g. Zod) shared with the mutation arg validators where possible. Optimistic UI optional.
- **Dependencies:** Epic 3 #1 Create member schema, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:members`
- **Estimated effort:** M (4-8h)

## Issue 5: Guardian relationships

- **Title:** Guardian relationships for minors
- **Description:** Model and manage guardian-to-member relationships, especially required for minors.
- **Goal:** Minors can have one or more guardians linked, with contact details.
- **Acceptance criteria:**
  - [ ] A relationship structure links a guardian (member or contact) to a member with a relationship type.
  - [ ] UI to add/remove guardians from the member detail page.
  - [ ] Minors (by DOB) surface a prompt if no guardian is set.
  - [ ] Org-scoped and permission-gated.
- **Technical notes:** A guardian may be another member or a standalone contact. Consider a `guardianships` join table. Minor threshold should be configurable or a sensible default (e.g. under 18).
- **Dependencies:** Epic 3 #1 Create member schema
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:members`
- **Estimated effort:** M (4-8h)

## Issue 6: Emergency contact fields

- **Title:** Emergency contact fields
- **Description:** Capture emergency contact name, relationship, and phone for each member.
- **Goal:** Each member can store at least one emergency contact, visible to permitted staff.
- **Acceptance criteria:**
  - [ ] Emergency contact fields added to the member model/form.
  - [ ] Displayed on member detail to permitted roles.
  - [ ] Supports at least one contact (multiple optional).
  - [ ] Phone format validated.
- **Technical notes:** Could reuse the guardian record as an emergency contact to avoid duplication, but keep an explicit emergency flag. Visibility broader than medical notes but still role-gated.
- **Dependencies:** Epic 3 #1 Create member schema
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:members`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 7: Medical notes with restricted visibility

- **Title:** Medical notes with restricted visibility
- **Description:** Store sensitive medical notes/allergies for a member, visible only to authorised roles, with access logged.
- **Goal:** Medical information is captured and tightly access-controlled.
- **Acceptance criteria:**
  - [ ] Medical notes field(s) stored separately from general profile data.
  - [ ] Read access restricted to Owner/Admin/Committee/Coach per permission matrix.
  - [ ] Backend rejects reads for unauthorised roles (not just hidden in UI).
  - [ ] Access to medical notes is auditable.
- **Technical notes:** Enforce at the Convex layer, never client-only. Consider a dedicated query that performs the permission check and records access. Aligns with Epic 14 security tests.
- **Dependencies:** Epic 3 #1 Create member schema, Epic 2 #5 Implement role model
- **Labels:** `area:backend`, `area:web`, `type:security`, `epic:members`
- **Estimated effort:** M (4-8h)

## Issue 8: Team schema

- **Title:** Define team schema
- **Description:** Create the `teams` table with name, age group/division, season, and org scoping.
- **Goal:** A typed, indexed `teams` table ready for rosters and coach assignment.
- **Acceptance criteria:**
  - [ ] `teams` table includes org id, name, age group/division, season, and timestamps.
  - [ ] Indexed by org id.
  - [ ] Supports active/archived state.
  - [ ] Schema validates required fields.
- **Technical notes:** Roster and coach links are separate join tables (Issues 11-12) to allow many-to-many and history.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `type:feature`, `epic:teams`
- **Estimated effort:** S (2-4h)

## Issue 9: Team list page

- **Title:** Team list page
- **Description:** A list of teams for the active organisation with quick stats (member count, coach).
- **Goal:** Staff can browse and navigate teams.
- **Acceptance criteria:**
  - [ ] Table/cards show team name, division/age group, member count, and coach.
  - [ ] Filter by season/active state.
  - [ ] Create-team action for permitted roles.
  - [ ] Row click navigates to team detail.
- **Technical notes:** Member counts derived from the roster join table; consider denormalised count or an aggregate query.
- **Dependencies:** Epic 3 #8 Team schema, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `type:feature`, `epic:teams`
- **Estimated effort:** S (2-4h)

## Issue 10: Team detail page

- **Title:** Team detail page
- **Description:** A single-team view showing roster, coaches, and related events.
- **Goal:** A complete team overview with roster and coach management entry points.
- **Acceptance criteria:**
  - [ ] Shows team metadata, roster, and assigned coaches.
  - [ ] Links to assign/remove members and coaches (per role).
  - [ ] Lists upcoming team events (from Epic 4).
  - [ ] Edit/archive actions for permitted roles.
- **Technical notes:** Upcoming-events section can be a stub until Epic 4 #8 ships. Roster ordering by name or position.
- **Dependencies:** Epic 3 #8 Team schema, Epic 3 #11 Assign members to teams, Epic 3 #12 Assign coaches to teams
- **Labels:** `area:web`, `type:feature`, `epic:teams`
- **Estimated effort:** M (4-8h)

## Issue 11: Assign members to teams

- **Title:** Assign members to teams
- **Description:** Manage team rosters by adding/removing members, supporting members on multiple teams.
- **Goal:** Members can be assigned to and removed from teams with history.
- **Acceptance criteria:**
  - [ ] A roster join table links member + team (+ optional position).
  - [ ] UI to add/remove members from a team.
  - [ ] A member can belong to multiple teams.
  - [ ] Org-scoped and permission-gated (Admin/Committee/Coach for own team).
- **Technical notes:** Coaches should only manage rosters for their own teams (team-scoped permission). Prevent cross-org assignment.
- **Dependencies:** Epic 3 #8 Team schema, Epic 3 #1 Create member schema
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:teams`
- **Estimated effort:** M (4-8h)

## Issue 12: Assign coaches to teams

- **Title:** Assign coaches to teams
- **Description:** Assign one or more coaches (members with Coach role) to a team.
- **Goal:** Teams have designated coaches who gain team-scoped permissions.
- **Acceptance criteria:**
  - [ ] A coach assignment join table links coach + team.
  - [ ] Admins can assign/unassign coaches.
  - [ ] Assigning a coach grants team-scoped capabilities (roster, attendance).
  - [ ] Org-scoped and permission-gated.
- **Technical notes:** Coach assignment feeds team-scoped permission checks used in roster and event/attendance management. Ensure the assigned user has (or is granted) the Coach role.
- **Dependencies:** Epic 3 #8 Team schema, Epic 2 #5 Implement role model
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:teams`
- **Estimated effort:** M (4-8h)
