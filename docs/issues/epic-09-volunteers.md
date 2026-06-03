# Epic 9: Volunteers

This epic extends member records with volunteer-specific data: a volunteer flag, skills, certifications with expiry dates, a volunteer list, notes, and export. It also surfaces expiring certifications on the dashboard so clubs stay compliant. It builds on members (Epic 3) and auth (Epic 2).

## Issue 1: Volunteer fields on member profile

- **Title:** Volunteer fields on member profile
- **Description:** Add a volunteer flag and basic volunteer metadata to the member model and profile UI.
- **Goal:** Members can be marked as volunteers with associated metadata.
- **Acceptance criteria:**
  - [ ] A boolean/volunteer-role indicator on the member.
  - [ ] Volunteer section shown on member detail when applicable.
  - [ ] Editable via the member form for permitted roles.
  - [ ] Org-scoped and permission-gated.
- **Technical notes:** A member may also hold the Volunteer role (Epic 2 #5); this flag captures volunteering status independent of login role. Keep volunteer detail extensible for skills/certs.
- **Dependencies:** Epic 3 #1 Create member schema, Epic 2 #5 Implement role model
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:volunteers`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 2: Volunteer list

- **Title:** Volunteer list page
- **Description:** A filtered list of members who are volunteers, with skills and certification status at a glance.
- **Goal:** Staff can browse volunteers and their readiness.
- **Acceptance criteria:**
  - [ ] List shows volunteers with skills summary and certification status indicators.
  - [ ] Filter by skill and by certification validity.
  - [ ] Row click navigates to the member detail.
  - [ ] Org-scoped and permission-gated.
- **Technical notes:** Derive from members flagged as volunteers (Issue 1). Certification status indicator computed from expiry (Issue 5).
- **Dependencies:** Epic 9 #1 Volunteer fields on member profile, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `type:feature`, `epic:volunteers`
- **Estimated effort:** S (2-4h)

## Issue 3: Skills field

- **Title:** Volunteer skills field
- **Description:** Capture a set of skills/tags for each volunteer.
- **Goal:** Volunteers can be tagged with skills for matching to needs.
- **Acceptance criteria:**
  - [ ] Skills stored as a list of tags on the volunteer.
  - [ ] Add/remove skills via the member form.
  - [ ] Filterable in the volunteer list.
  - [ ] Validation prevents empty/duplicate tags.
- **Technical notes:** Free-form tags for MVP with autocomplete from existing org skills. Consider a normalised skills table later.
- **Dependencies:** Epic 9 #1 Volunteer fields on member profile
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:volunteers`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 4: Certification schema

- **Title:** Certification schema
- **Description:** Create a `certifications` table linking a volunteer to named certifications (e.g. first aid, safeguarding, coaching badge).
- **Goal:** Volunteer certifications are recorded with name, issuer, and dates.
- **Acceptance criteria:**
  - [ ] Table includes org id, member id, certification name, issuer, issue date, and expiry date.
  - [ ] Indexed by member id and by org id + expiry.
  - [ ] CRUD via the member detail page for permitted roles.
  - [ ] Schema validates required fields.
- **Technical notes:** Expiry is optional for non-expiring certs. Index on expiry powers the expiring-certifications dashboard (Issue 6).
- **Dependencies:** Epic 9 #1 Volunteer fields on member profile
- **Labels:** `area:backend`, `type:feature`, `epic:volunteers`
- **Estimated effort:** S (2-4h)

## Issue 5: Certification expiry dates

- **Title:** Certification expiry tracking
- **Description:** Track certification expiry and compute validity status (valid, expiring soon, expired).
- **Goal:** Each certification shows a clear validity status driven by its expiry date.
- **Acceptance criteria:**
  - [ ] Validity status computed from expiry and current date with an "expiring soon" window.
  - [ ] Status shown on member detail and volunteer list.
  - [ ] Configurable "expiring soon" threshold (default e.g. 30 days).
  - [ ] Non-expiring certs handled (always valid).
- **Technical notes:** Compute status in a shared helper used by web and dashboard widgets. Avoid storing derived status; compute on read.
- **Dependencies:** Epic 9 #4 Certification schema
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:volunteers`
- **Estimated effort:** S (2-4h)

## Issue 6: Expiring certification dashboard

- **Title:** Expiring certification dashboard widget
- **Description:** A dashboard view listing certifications expiring soon or already expired.
- **Goal:** Staff are alerted to certifications needing renewal.
- **Acceptance criteria:**
  - [ ] Lists certifications expiring within the threshold and those expired, with volunteer and dates.
  - [ ] Sorted by soonest expiry.
  - [ ] Org-scoped and permission-gated.
  - [ ] Links to the relevant member.
- **Technical notes:** Uses the org id + expiry index (Issue 4) and the validity helper (Issue 5). Also referenced by Epic 13 #7.
- **Dependencies:** Epic 9 #5 Certification expiry dates
- **Labels:** `area:web`, `type:feature`, `epic:volunteers`
- **Estimated effort:** S (2-4h)

## Issue 7: Volunteer notes

- **Title:** Volunteer notes
- **Description:** Allow staff to record notes about a volunteer (availability, preferences, history).
- **Goal:** Staff can keep contextual notes on volunteers.
- **Acceptance criteria:**
  - [ ] Notes field(s) on the volunteer, editable by permitted roles.
  - [ ] Displayed on member detail's volunteer section.
  - [ ] Permission-gated read/write.
  - [ ] Optional timestamped note history.
- **Technical notes:** Plain text/markdown notes are sufficient for MVP; do not use this area for high-sensitivity personal information.
- **Dependencies:** Epic 9 #1 Volunteer fields on member profile
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:volunteers`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 8: Volunteer export

- **Title:** Volunteer export
- **Description:** Export volunteers with skills and certification status to CSV.
- **Goal:** Staff can export volunteer data for planning and compliance.
- **Acceptance criteria:**
  - [ ] CSV includes volunteer name, contact, skills, and certification status/expiry.
  - [ ] Respects current filters.
  - [ ] Permission-gated.
  - [ ] Handles empty result gracefully.
- **Technical notes:** Reuse the shared CSV utility (Epic 13 #9). Flatten multiple certifications per volunteer sensibly (e.g. one row per cert or concatenated).
- **Dependencies:** Epic 9 #2 Volunteer list, Epic 9 #5 Certification expiry dates
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:volunteers`
- **Estimated effort:** S (2-4h)
