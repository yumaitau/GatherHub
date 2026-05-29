# Epic 4: Events & Attendance

This epic adds events (training, matches, meetings) and attendance/RSVP tracking. Events can be organisation-wide or team-specific, members RSVP, and staff track attendance. The epic also surfaces upcoming events on the dashboard and supports attendance export. It builds on members/teams (Epic 3) and auth scoping (Epic 2).

## Issue 1: Event schema

- **Title:** Define event schema
- **Description:** Create the `events` table with title, type, start/end times, location, optional team link, and org scoping.
- **Goal:** A typed, indexed `events` table ready for CRUD, RSVP, and attendance.
- **Acceptance criteria:**
  - [ ] `events` table includes org id, title, type, start/end, location, optional team id, and timestamps.
  - [ ] Indexed by org id and by start time.
  - [ ] Optional description/notes field.
  - [ ] Schema validates required fields and that end >= start.
- **Technical notes:** Event type enum defined in Issue 5. Team link enables team-specific events (Issue 8). Index on start time supports upcoming-events queries.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `type:feature`, `epic:events`
- **Estimated effort:** S (2-4h)

## Issue 2: Event list page

- **Title:** Event list page
- **Description:** A list/calendar-style view of events for the active organisation with filtering.
- **Goal:** Staff and members can browse events and navigate to detail.
- **Acceptance criteria:**
  - [ ] List shows title, type, date/time, location, and team (if any).
  - [ ] Filter by type, team, and date range (upcoming/past).
  - [ ] Create-event action for permitted roles.
  - [ ] Row click navigates to event detail.
- **Technical notes:** A simple chronological list suffices for MVP; a calendar view can come later. Default to upcoming events.
- **Dependencies:** Epic 4 #1 Event schema, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `type:feature`, `epic:events`
- **Estimated effort:** M (4-8h)

## Issue 3: Event detail page

- **Title:** Event detail page
- **Description:** A single-event view showing details, RSVP controls, and attendance summary.
- **Goal:** Users can view an event, RSVP, and (if permitted) see attendance.
- **Acceptance criteria:**
  - [ ] Displays full event details and associated team.
  - [ ] RSVP control for the current user.
  - [ ] Attendance summary (counts by status) for permitted roles.
  - [ ] Edit/delete actions for permitted roles.
- **Technical notes:** RSVP control wires to Issue 6; attendance view to Issue 7. Show member-level attendance only to staff/coaches.
- **Dependencies:** Epic 4 #1 Event schema, Epic 4 #6 RSVP mutation, Epic 4 #7 Attendance status view
- **Labels:** `area:web`, `type:feature`, `epic:events`
- **Estimated effort:** M (4-8h)

## Issue 4: Event form

- **Title:** Event create/edit form
- **Description:** A validated form to create and edit events including type, schedule, location, and optional team.
- **Goal:** Staff can create and edit events with validation.
- **Acceptance criteria:**
  - [ ] Create/edit share a validated form (required title, valid date/time range).
  - [ ] Team selector optional; when set, event is team-specific.
  - [ ] Submits to org-scoped mutations.
  - [ ] Only permitted roles can create/edit; coaches limited to their teams.
- **Technical notes:** Validate end >= start. Reuse shared validation schema with the mutation. Default type to training.
- **Dependencies:** Epic 4 #1 Event schema, Epic 4 #5 Event types, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:events`
- **Estimated effort:** M (4-8h)

## Issue 5: Event types

- **Title:** Event types (training/match/meeting)
- **Description:** Define an event type enum and reflect it in filtering, display, and styling.
- **Goal:** Events are categorised and visually distinguishable by type.
- **Acceptance criteria:**
  - [ ] Enum: training, match, meeting (extensible).
  - [ ] Type stored on the event and shown with a badge.
  - [ ] List filtering by type works.
  - [ ] Validation rejects unknown types.
- **Technical notes:** Keep the enum centralised so iOS and web share the same values. Consider an "other" fallback.
- **Dependencies:** Epic 4 #1 Event schema
- **Labels:** `area:backend`, `type:feature`, `epic:events`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 6: RSVP mutation

- **Title:** RSVP mutation
- **Description:** Allow a member to set their RSVP status (going/maybe/not going) for an event.
- **Goal:** Members can RSVP and update their response.
- **Acceptance criteria:**
  - [ ] An `rsvps`/attendance table stores event + member + status + timestamp.
  - [ ] Mutation upserts the caller's RSVP for an event.
  - [ ] Status enum: going, maybe, not_going.
  - [ ] Org-scoped; users can only set their own RSVP (staff may set on behalf).
- **Technical notes:** One RSVP per member per event (upsert). Distinguish RSVP intent from recorded attendance if needed; for MVP a single status field can serve both with a separate "attended" flag updated at the event.
- **Dependencies:** Epic 4 #1 Event schema, Epic 3 #1 Create member schema
- **Labels:** `area:backend`, `type:feature`, `epic:events`
- **Estimated effort:** M (4-8h)

## Issue 7: Attendance status view

- **Title:** Attendance status view
- **Description:** Show, for an event, the list of members and their RSVP/attendance status, with the ability for staff to mark actual attendance.
- **Goal:** Coaches/staff can see who is coming and record who attended.
- **Acceptance criteria:**
  - [ ] View lists relevant members with their RSVP status.
  - [ ] Staff/coaches can mark attended/absent per member.
  - [ ] Counts by status displayed.
  - [ ] Permission-gated; coaches limited to their teams.
- **Technical notes:** For team events, default the member list to the team roster (Epic 3 #11). For org events, allow all members. Recording attendance updates the attendance record.
- **Dependencies:** Epic 4 #6 RSVP mutation, Epic 3 #11 Assign members to teams
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:events`
- **Estimated effort:** M (4-8h)

## Issue 8: Team-specific events

- **Title:** Team-specific events
- **Description:** Support events scoped to a single team, visible/relevant to that team's members and coaches.
- **Goal:** Team events appear on team views and default attendance to the roster.
- **Acceptance criteria:**
  - [ ] Events with a team id are flagged as team-specific.
  - [ ] Team detail page lists upcoming team events.
  - [ ] Attendance defaults to the team roster.
  - [ ] Coaches can manage their own team's events.
- **Technical notes:** Reuses the optional team link on the event schema (Issue 1). Org-wide events have no team id.
- **Dependencies:** Epic 4 #1 Event schema, Epic 3 #10 Team detail page
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:events`
- **Estimated effort:** S (2-4h)

## Issue 9: Upcoming events dashboard card

- **Title:** Upcoming events dashboard card
- **Description:** A dashboard widget showing the next few upcoming events for the active organisation (and the user's teams).
- **Goal:** Users see relevant upcoming events at a glance on the dashboard.
- **Acceptance criteria:**
  - [ ] Card lists the next N upcoming events with date, type, and team.
  - [ ] Respects org scope and the user's team memberships.
  - [ ] Empty state when no upcoming events.
  - [ ] Clicking an event navigates to its detail.
- **Technical notes:** Uses the start-time index for efficient querying. This card is also referenced by Epic 13 #4.
- **Dependencies:** Epic 4 #1 Event schema
- **Labels:** `area:web`, `type:feature`, `epic:events`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 10: Attendance export

- **Title:** Attendance export
- **Description:** Export attendance data for an event (or date range) to CSV.
- **Goal:** Staff can download attendance records for reporting/record-keeping.
- **Acceptance criteria:**
  - [ ] Export produces a CSV with member, event, status, and timestamp.
  - [ ] Supports per-event and per-team/date-range export.
  - [ ] Permission-gated to staff/coaches.
  - [ ] Handles empty result gracefully.
- **Technical notes:** Generate CSV client-side from an org-scoped query, or via a Convex action for larger sets. Reuse the shared CSV utility from Epic 13 #9.
- **Dependencies:** Epic 4 #7 Attendance status view
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:events`
- **Estimated effort:** S (2-4h)
