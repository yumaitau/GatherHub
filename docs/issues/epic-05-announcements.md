# Epic 5: Announcements

This epic provides organisation-wide and team-specific announcements with pinning, read/unread tracking, and permission controls. It lets committees and coaches communicate with members and tracks engagement. It depends on auth scoping (Epic 2) and teams (Epic 3).

## Issue 1: Announcement schema

- **Title:** Define announcement schema
- **Description:** Create the `announcements` table with title, body, author, scope (org or team), pinned flag, and timestamps.
- **Goal:** A typed, indexed `announcements` table ready for posting and listing.
- **Acceptance criteria:**
  - [ ] Table includes org id, optional team id, title, body, author id, pinned flag, and timestamps.
  - [ ] Indexed by org id and by team id.
  - [ ] Supports rich-text or markdown body (stored as text).
  - [ ] Schema validates required fields.
- **Technical notes:** Team id null means org-wide. Author references the Convex user. Keep body as sanitised markdown/plain text for MVP.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `type:feature`, `epic:announcements`
- **Estimated effort:** S (2-4h)

## Issue 2: Organisation announcement form

- **Title:** Organisation announcement form
- **Description:** A form for Owners/Admins/Committee to post org-wide announcements.
- **Goal:** Authorised staff can publish org-wide announcements.
- **Acceptance criteria:**
  - [ ] Validated form with title and body.
  - [ ] Submits an org-scoped, team-less announcement.
  - [ ] Only Owner/Admin/Committee can post.
  - [ ] Success/error feedback shown.
- **Technical notes:** Reuse a shared editor component for org and team forms. Sanitise body before storage/render.
- **Dependencies:** Epic 5 #1 Announcement schema, Epic 5 #7 Announcement permissions
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:announcements`
- **Estimated effort:** S (2-4h)

## Issue 3: Team announcement form

- **Title:** Team announcement form
- **Description:** A form for coaches (and staff) to post announcements to a specific team.
- **Goal:** Coaches can communicate with their team.
- **Acceptance criteria:**
  - [ ] Validated form with team selector (defaulting to the coach's team), title, and body.
  - [ ] Submits a team-scoped announcement.
  - [ ] Coaches limited to their own teams; staff may post to any team.
  - [ ] Success/error feedback shown.
- **Technical notes:** Team selection constrained by the user's coach assignments (Epic 3 #12). Shares the editor with Issue 2.
- **Dependencies:** Epic 5 #1 Announcement schema, Epic 3 #12 Assign coaches to teams, Epic 5 #7 Announcement permissions
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:announcements`
- **Estimated effort:** S (2-4h)

## Issue 4: Announcement list

- **Title:** Announcement list/feed
- **Description:** A feed showing announcements relevant to the current user (org-wide plus their teams), newest first with pinned on top.
- **Goal:** Users see a unified, relevant announcement feed.
- **Acceptance criteria:**
  - [ ] Feed merges org-wide and the user's team announcements.
  - [ ] Pinned announcements appear first, then reverse-chronological.
  - [ ] Shows title, snippet, author, scope, and date.
  - [ ] Empty state when none.
- **Technical notes:** Compute the user's team memberships to filter team announcements. Consider pagination for long histories.
- **Dependencies:** Epic 5 #1 Announcement schema, Epic 5 #5 Pinned announcements
- **Labels:** `area:web`, `type:feature`, `epic:announcements`
- **Estimated effort:** M (4-8h)

## Issue 5: Pinned announcements

- **Title:** Pinned announcements
- **Description:** Allow authorised users to pin/unpin announcements so they surface at the top of the feed.
- **Goal:** Important announcements can be pinned and are visually distinct.
- **Acceptance criteria:**
  - [ ] Pin/unpin action available to authorised roles.
  - [ ] Pinned items sort to the top with a pinned indicator.
  - [ ] Pin state persists and is org/team-scoped.
  - [ ] Permission-gated.
- **Technical notes:** Optionally cap the number of pinned items shown. Coaches pin within their team; staff pin org-wide.
- **Dependencies:** Epic 5 #1 Announcement schema, Epic 5 #7 Announcement permissions
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:announcements`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 6: Read/unread tracking

- **Title:** Read/unread tracking
- **Description:** Track which announcements each user has read and surface unread counts/indicators.
- **Goal:** Users can distinguish read from unread announcements and see an unread count.
- **Acceptance criteria:**
  - [ ] A read-receipts structure records user + announcement + read timestamp.
  - [ ] Unread announcements are visually marked.
  - [ ] An unread count is available for a nav badge.
  - [ ] Marking read (on open or explicitly) updates state.
- **Technical notes:** Store per-user read receipts keyed by announcement; derive unread as relevant-announcements minus receipts. Avoid heavy writes by marking read on detail open.
- **Dependencies:** Epic 5 #4 Announcement list
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:announcements`
- **Estimated effort:** M (4-8h)

## Issue 7: Announcement permissions

- **Title:** Announcement permissions
- **Description:** Define and enforce who may create, edit, pin, and delete announcements at org and team scope.
- **Goal:** Posting and managing announcements is correctly role- and scope-gated server-side.
- **Acceptance criteria:**
  - [ ] Org announcements: Owner/Admin/Committee only.
  - [ ] Team announcements: assigned coaches (their team) plus staff.
  - [ ] Edit/delete restricted to author or staff.
  - [ ] Enforced in Convex mutations, not just UI.
- **Technical notes:** Centralise checks in a permission helper consumed by Issues 2-5. Reuse the role matrix from Epic 2 #5 and coach assignments from Epic 3 #12.
- **Dependencies:** Epic 2 #5 Implement role model, Epic 3 #12 Assign coaches to teams
- **Labels:** `area:backend`, `type:security`, `epic:announcements`
- **Estimated effort:** S (2-4h)
