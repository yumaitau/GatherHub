# Epic 7: Asset Operations & Audit Log

This epic adds the operational lifecycle for KitTrace assets — check-out, check-in, transfer, report-lost, maintenance, and retire — each recorded in an immutable audit log. It also surfaces asset history, enforces operation permissions, and provides overdue/lost views and export. The audit log is the source of truth for accountability and feeds reporting (Epic 13) and security tests (Epic 14).

## Issue 1: Asset audit log schema (immutable)

- **Title:** Define immutable asset audit log schema
- **Description:** Create an append-only `asset_events` table recording every asset operation with actor, type, before/after, timestamp, and notes.
- **Goal:** A tamper-evident, append-only history of all asset operations.
- **Acceptance criteria:**
  - [ ] Table includes org id, asset id, event type, actor id, from/to custodian, from/to location, from/to status, note, and timestamp.
  - [ ] Records are write-once: no update or delete mutations exist.
  - [ ] Indexed by asset id and by org id + timestamp.
  - [ ] Event type enum covers all operations.
- **Technical notes:** Immutability is enforced by only exposing insert paths and excluding patch/delete from the public API. The integrity test (Epic 14 #5) verifies no mutation can alter prior entries.
- **Dependencies:** Epic 6 #1 Asset schema, Epic 2 #6 Add Convex auth guards
- **Labels:** `area:backend`, `area:kittrace`, `type:security`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 2: Check-out mutation

- **Title:** Asset check-out mutation
- **Description:** Check an available asset out to a custodian, updating status/custodian and appending an audit entry.
- **Goal:** Staff/coaches can check out assets with a full audit trail.
- **Acceptance criteria:**
  - [ ] Mutation sets status to checked_out and custodian to the target member.
  - [ ] Optional due date recorded for overdue tracking.
  - [ ] Audit entry appended atomically.
  - [ ] Rejects if asset is not available or caller lacks permission.
- **Technical notes:** Enforce valid status transition (available -> checked_out). Due date powers Issue 10. Do the status update and audit insert in a single mutation for atomicity.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 7 #9 Enforce asset operation permissions
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 3: Check-in mutation

- **Title:** Asset check-in mutation
- **Description:** Check a checked-out asset back in, clearing custodian, setting status available, updating location, and appending an audit entry.
- **Goal:** Staff/coaches can check in assets with an audit trail.
- **Acceptance criteria:**
  - [ ] Mutation sets status to available and clears custodian.
  - [ ] Optional location and condition update on check-in.
  - [ ] Audit entry appended atomically.
  - [ ] Rejects if asset is not checked_out or caller lacks permission.
- **Technical notes:** Valid transition checked_out -> available. Allow recording condition changes observed at return.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 7 #9 Enforce asset operation permissions
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 4: Transfer mutation

- **Title:** Asset transfer mutation
- **Description:** Transfer a checked-out asset from one custodian to another without a check-in step, recording the change.
- **Goal:** Custody can move directly between members with an audit trail.
- **Acceptance criteria:**
  - [ ] Mutation updates custodian from current to target member.
  - [ ] Status remains checked_out; location optionally updated.
  - [ ] Audit entry records from/to custodian.
  - [ ] Rejects if asset is not checked_out or caller lacks permission.
- **Technical notes:** Validate target member is in the same org. Useful for kit handed between players/coaches.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 7 #9 Enforce asset operation permissions
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 5: Report-lost mutation

- **Title:** Report-lost mutation
- **Description:** Mark an asset as lost, capturing who reported it and any notes, and appending an audit entry.
- **Goal:** Lost assets are flagged and surfaced on dashboards.
- **Acceptance criteria:**
  - [ ] Mutation sets status to lost and clears/keeps custodian per policy.
  - [ ] Requires a note describing circumstances.
  - [ ] Audit entry appended atomically.
  - [ ] Permission-gated.
- **Technical notes:** Retain last-known custodian/location in the audit entry for follow-up. Lost is recoverable (e.g. found -> check-in) per the transition graph.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 7 #9 Enforce asset operation permissions
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 6: Maintenance mutation

- **Title:** Maintenance mutation
- **Description:** Move an asset into/out of maintenance, optionally updating condition, with an audit entry.
- **Goal:** Maintenance state is tracked and audited.
- **Acceptance criteria:**
  - [ ] Mutation toggles status to in_maintenance and back to available.
  - [ ] Optional condition and note update.
  - [ ] Audit entry appended atomically.
  - [ ] Permission-gated.
- **Technical notes:** Valid transitions available/checked_out -> in_maintenance -> available. Condition update integrates with Epic 6 #10.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 7 #9 Enforce asset operation permissions
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 7: Retire mutation

- **Title:** Retire mutation
- **Description:** Retire an asset (terminal state), recording the reason and appending an audit entry.
- **Goal:** End-of-life assets are retired without deletion, preserving history.
- **Acceptance criteria:**
  - [ ] Mutation sets status to retired (terminal) and clears custodian.
  - [ ] Requires a reason note.
  - [ ] Audit entry appended atomically.
  - [ ] Retired assets are excluded from default active lists but remain queryable.
- **Technical notes:** Retired is terminal; further operations are rejected. Never hard-delete assets, to preserve audit integrity.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 7 #9 Enforce asset operation permissions
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 8: Display asset history

- **Title:** Display asset history
- **Description:** Show the chronological audit log on the asset detail page.
- **Goal:** Users can see a readable timeline of all operations on an asset.
- **Acceptance criteria:**
  - [ ] History timeline lists events newest-first with type, actor, from/to, note, and timestamp.
  - [ ] Loads efficiently via the asset-id index.
  - [ ] Empty state for assets with no operations.
  - [ ] Visible to permitted roles.
- **Technical notes:** Render human-friendly event descriptions (e.g. "Checked out to Jane by Admin"). Paginate for long histories.
- **Dependencies:** Epic 7 #1 Asset audit log schema, Epic 6 #5 Asset detail page
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 9: Enforce asset operation permissions

- **Title:** Enforce asset operation permissions
- **Description:** Centralise permission checks for all asset operations, gating by role (and team where relevant).
- **Goal:** Only authorised users can perform each asset operation, enforced server-side.
- **Acceptance criteria:**
  - [ ] A permission helper governs check-out/in, transfer, report-lost, maintenance, retire.
  - [ ] Players/Parents cannot perform management operations.
  - [ ] All operation mutations call the helper before mutating.
  - [ ] Unauthorised attempts are rejected with a typed error.
- **Technical notes:** Reuse the role matrix (Epic 2 #5). Consider allowing Coaches to manage their team's kit. This underpins Epic 14 #4 role tests.
- **Dependencies:** Epic 2 #5 Implement role model, Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:security`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 10: Overdue asset view

- **Title:** Overdue asset view
- **Description:** List checked-out assets whose due date has passed.
- **Goal:** Staff can identify and chase overdue assets.
- **Acceptance criteria:**
  - [ ] View lists checked-out assets past their due date with custodian and days overdue.
  - [ ] Sortable by overdue duration.
  - [ ] Quick link to the asset and custodian.
  - [ ] Org-scoped and permission-gated.
- **Technical notes:** Depends on the optional due date recorded at check-out (Issue 2). Compute overdue against current time.
- **Dependencies:** Epic 7 #2 Check-out mutation
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 11: Missing/lost asset dashboard

- **Title:** Missing/lost asset dashboard
- **Description:** A view summarising lost/missing assets and their total replacement value.
- **Goal:** Staff see lost assets and value-at-risk at a glance.
- **Acceptance criteria:**
  - [ ] Lists assets with status lost, with last custodian/location and value.
  - [ ] Shows total replacement value of lost assets.
  - [ ] Org-scoped and permission-gated.
  - [ ] Links to each asset's history.
- **Technical notes:** Aggregates replacement value (Epic 6 #13). Also feeds the Epic 13 #6 lost-assets widget.
- **Dependencies:** Epic 7 #5 Report-lost mutation, Epic 6 #13 Replacement value field
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 12: Asset export

- **Title:** Asset export
- **Description:** Export the asset inventory (and optionally audit history) to CSV.
- **Goal:** Staff can export asset data for offline records and insurance.
- **Acceptance criteria:**
  - [ ] Export produces a CSV of assets with key fields including status, custodian, location, and value.
  - [ ] Optional inclusion of recent audit events.
  - [ ] Respects current filters.
  - [ ] Permission-gated.
- **Technical notes:** Reuse the shared CSV utility (Epic 13 #9). For large exports consider a Convex action streaming results.
- **Dependencies:** Epic 6 #1 Asset schema, Epic 7 #1 Asset audit log schema
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)
