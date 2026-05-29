# Epic 13: Reporting & Dashboards

This epic assembles the admin dashboard and its widgets (member/team counts, upcoming events, checked-out and lost assets, expiring certifications, sponsor value), plus shared CSV export utilities and a basic audit report. It composes data produced by earlier epics into at-a-glance views and exportable reports. All data is org-scoped and role-gated.

## Issue 1: Admin dashboard

- **Title:** Admin dashboard layout
- **Description:** A dashboard page that lays out the key widgets for the active organisation.
- **Goal:** Admins land on a useful overview composed of widgets.
- **Acceptance criteria:**
  - [ ] Dashboard route renders a responsive grid of widgets.
  - [ ] Widgets load independently with their own loading/empty states.
  - [ ] Org-scoped and role-gated (staff).
  - [ ] Layout is responsive across breakpoints.
- **Technical notes:** Provide a shared widget container component (title, loading, empty, error). Widgets below plug into this grid.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `type:feature`, `epic:reporting`
- **Estimated effort:** M (4-8h)

## Issue 2: Member count widget

- **Title:** Member count widget
- **Description:** A widget showing total and active member counts.
- **Goal:** Admins see member totals at a glance.
- **Acceptance criteria:**
  - [ ] Shows total members and active members.
  - [ ] Org-scoped query.
  - [ ] Loading and empty states.
  - [ ] Links to the member list.
- **Technical notes:** Use an aggregate query over members (Epic 3 #1). Consider count efficiency for large orgs.
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 3 #1 Create member schema
- **Labels:** `area:web`, `type:feature`, `epic:reporting`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 3: Team count widget

- **Title:** Team count widget
- **Description:** A widget showing the number of teams (and active teams).
- **Goal:** Admins see team totals at a glance.
- **Acceptance criteria:**
  - [ ] Shows total/active team counts.
  - [ ] Org-scoped query.
  - [ ] Loading and empty states.
  - [ ] Links to the team list.
- **Technical notes:** Aggregate over teams (Epic 3 #8).
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 3 #8 Team schema
- **Labels:** `area:web`, `type:feature`, `epic:reporting`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 4: Upcoming events widget

- **Title:** Upcoming events widget
- **Description:** A dashboard widget listing the next few upcoming events.
- **Goal:** Admins see imminent events on the dashboard.
- **Acceptance criteria:**
  - [ ] Lists the next N upcoming events with date/type/team.
  - [ ] Org-scoped and relevant to the user.
  - [ ] Empty state when none.
  - [ ] Links to event detail.
- **Technical notes:** Reuse the upcoming-events query/card from Epic 4 #9.
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 4 #9 Upcoming events dashboard card
- **Labels:** `area:web`, `type:feature`, `epic:reporting`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 5: Checked-out assets widget

- **Title:** Checked-out assets widget
- **Description:** A widget showing the count (and value) of currently checked-out assets, highlighting overdue.
- **Goal:** Admins see outstanding asset custody at a glance.
- **Acceptance criteria:**
  - [ ] Shows count of checked-out assets and how many are overdue.
  - [ ] Optional total replacement value out on loan.
  - [ ] Org-scoped query.
  - [ ] Links to the checked-out/overdue views.
- **Technical notes:** Uses asset status (Epic 6 #3) and overdue logic (Epic 7 #10).
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 7 #10 Overdue asset view
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:reporting`
- **Estimated effort:** S (2-4h)

## Issue 6: Lost assets widget

- **Title:** Lost assets widget
- **Description:** A widget showing the count and total value of lost assets.
- **Goal:** Admins see lost-asset exposure at a glance.
- **Acceptance criteria:**
  - [ ] Shows count of lost assets and total replacement value.
  - [ ] Org-scoped query.
  - [ ] Loading/empty states.
  - [ ] Links to the lost-asset dashboard.
- **Technical notes:** Reuses the lost-asset aggregation (Epic 7 #11) and replacement value (Epic 6 #13).
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 7 #11 Missing/lost asset dashboard
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:reporting`
- **Estimated effort:** S (2-4h)

## Issue 7: Expiring volunteer certifications widget

- **Title:** Expiring volunteer certifications widget
- **Description:** A widget summarising certifications expiring soon or expired.
- **Goal:** Admins are alerted to certification renewals on the dashboard.
- **Acceptance criteria:**
  - [ ] Shows count of expiring-soon and expired certifications.
  - [ ] Org-scoped query.
  - [ ] Loading/empty states.
  - [ ] Links to the expiring-certifications view.
- **Technical notes:** Reuses the expiry logic and view (Epic 9 #5/#6).
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 9 #6 Expiring certification dashboard
- **Labels:** `area:web`, `type:feature`, `epic:reporting`
- **Estimated effort:** S (2-4h)

## Issue 8: Sponsor value widget

- **Title:** Sponsor value widget
- **Description:** A widget showing total active sponsorship value and active sponsor count.
- **Goal:** Admins see sponsorship contribution at a glance.
- **Acceptance criteria:**
  - [ ] Shows total active sponsorship value and active sponsor count.
  - [ ] Org-scoped query.
  - [ ] Loading/empty states.
  - [ ] Links to the sponsor list/report.
- **Technical notes:** Aggregates sponsor value (Epic 10 #6) filtered by active status (Epic 10 #7).
- **Dependencies:** Epic 13 #1 Admin dashboard, Epic 10 #6 Sponsorship value tracking
- **Labels:** `area:web`, `type:feature`, `epic:reporting`
- **Estimated effort:** S (2-4h)

## Issue 9: CSV exports

- **Title:** Shared CSV export utility
- **Description:** A reusable utility for generating and downloading CSVs, used across members, attendance, assets, volunteers, and sponsors.
- **Goal:** A single, consistent CSV export mechanism reused by all export features.
- **Acceptance criteria:**
  - [ ] Utility accepts rows/columns and triggers a browser download.
  - [ ] Handles escaping, headers, and empty data.
  - [ ] Reused by at least the existing export features.
  - [ ] Unit-tested.
- **Technical notes:** Keep escaping RFC-4180 compliant. For large server-side exports, pair with a Convex action; the client utility handles small/medium sets.
- **Dependencies:** Epic 1 #3 Configure React frontend
- **Labels:** `area:web`, `type:feature`, `epic:reporting`
- **Estimated effort:** S (2-4h)

## Issue 10: Basic audit report

- **Title:** Basic audit report
- **Description:** A report over the asset audit log filterable by date/asset/type, with CSV export.
- **Goal:** Admins can review and export asset operation history.
- **Acceptance criteria:**
  - [ ] Report lists audit events filterable by date range, asset, and event type.
  - [ ] CSV export of the filtered results.
  - [ ] Org-scoped and permission-gated.
  - [ ] Handles large/empty result sets.
- **Technical notes:** Reads the immutable audit log (Epic 7 #1) via its indexes; reuses the CSV utility (Issue 9). Read-only.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 13 #9 CSV exports
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:reporting`
- **Estimated effort:** S (2-4h)
