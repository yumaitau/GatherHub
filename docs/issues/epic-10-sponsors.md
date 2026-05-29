# Epic 10: Sponsors

This epic manages club sponsors: a sponsor data model, list/detail/form, logo upload, sponsorship value and date tracking, links to sponsored assets (Epic 6 #14), public website visibility (Epic 11), and a basic sponsor report. It builds on auth scoping (Epic 2) and integrates with KitTrace and the public site.

## Issue 1: Sponsor schema

- **Title:** Define sponsor schema
- **Description:** Create the `sponsors` table with name, contact, logo reference, value, dates, visibility, and org scoping.
- **Goal:** A typed, indexed `sponsors` table ready for CRUD and relationships.
- **Acceptance criteria:**
  - [ ] Table includes org id, name, contact details, website, logo file ref, sponsorship value, start/end dates, public visibility flag, and timestamps.
  - [ ] Indexed by org id.
  - [ ] Supports active/expired derivation from dates.
  - [ ] Schema validates required fields.
- **Technical notes:** Logo stored via Convex file storage (Issue 5). Value as minor units/currency (consistent with Epic 6 #13). Visibility flag drives public site (Issue 9).
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `type:feature`, `epic:sponsors`
- **Estimated effort:** S (2-4h)

## Issue 2: Sponsor list page

- **Title:** Sponsor list page
- **Description:** A list of sponsors for the active organisation with logo, value, and status.
- **Goal:** Staff can browse and navigate sponsors.
- **Acceptance criteria:**
  - [ ] List shows logo, name, value, status (active/expired), and dates.
  - [ ] Filter by active/expired.
  - [ ] Create-sponsor action for permitted roles.
  - [ ] Row click navigates to sponsor detail.
- **Technical notes:** Active/expired derived from start/end dates (Issue 7). Use the shadcn-style Table/cards.
- **Dependencies:** Epic 10 #1 Sponsor schema, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `type:feature`, `epic:sponsors`
- **Estimated effort:** S (2-4h)

## Issue 3: Sponsor detail page

- **Title:** Sponsor detail page
- **Description:** A single-sponsor view showing details, logo, value, dates, linked assets, and public visibility.
- **Goal:** A complete sponsor overview with relationships.
- **Acceptance criteria:**
  - [ ] Displays all sponsor fields and logo.
  - [ ] Lists linked sponsored assets (Epic 6 #14).
  - [ ] Shows and toggles public visibility (per role).
  - [ ] Edit/delete actions for permitted roles.
- **Technical notes:** Linked-assets section queries assets by sponsor reference. Visibility toggle integrates with Issue 9.
- **Dependencies:** Epic 10 #1 Sponsor schema, Epic 10 #8 Link sponsors to assets
- **Labels:** `area:web`, `type:feature`, `epic:sponsors`
- **Estimated effort:** M (4-8h)

## Issue 4: Sponsor form

- **Title:** Sponsor create/edit form
- **Description:** A validated form to create and edit sponsors including contact, value, dates, and visibility.
- **Goal:** Staff can add and update sponsors with validation.
- **Acceptance criteria:**
  - [ ] Create/edit share a validated form.
  - [ ] Logo upload integrated (Issue 5).
  - [ ] Submits to org-scoped mutations.
  - [ ] Permission-gated to Owner/Admin/Committee.
- **Technical notes:** Validate end date >= start date and non-negative value. Reuse shared validation schema.
- **Dependencies:** Epic 10 #1 Sponsor schema, Epic 10 #5 Sponsor logo upload, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:sponsors`
- **Estimated effort:** M (4-8h)

## Issue 5: Sponsor logo upload

- **Title:** Sponsor logo upload
- **Description:** Allow uploading and displaying a sponsor logo via Convex file storage.
- **Goal:** Sponsors can have a logo image stored and rendered.
- **Acceptance criteria:**
  - [ ] Upload accepts common image types with size limits.
  - [ ] File stored in Convex storage; reference saved on the sponsor.
  - [ ] Logo rendered on detail/list and public site.
  - [ ] Upload validates type/size and rejects others.
- **Technical notes:** Use Convex storage upload URLs. Validate MIME/size server-side (Epic 14 #6). Serve via stored file URL; consider image dimension constraints.
- **Dependencies:** Epic 10 #1 Sponsor schema, Epic 1 #6 Configure Convex
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:sponsors`
- **Estimated effort:** M (4-8h)

## Issue 6: Sponsorship value tracking

- **Title:** Sponsorship value tracking
- **Description:** Record the monetary value of each sponsorship for reporting and totals.
- **Goal:** Sponsorship value is captured and aggregable.
- **Acceptance criteria:**
  - [ ] Value stored as non-negative currency on the sponsor.
  - [ ] Editable via form and shown on detail/list.
  - [ ] Aggregable into a total sponsorship value.
  - [ ] Validation rejects negatives.
- **Technical notes:** Store minor units. Feeds the sponsor report (Issue 10) and Epic 13 #8 widget. Assume a single org currency for MVP.
- **Dependencies:** Epic 10 #1 Sponsor schema
- **Labels:** `area:backend`, `type:feature`, `epic:sponsors`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 7: Sponsor start/end dates

- **Title:** Sponsor start/end dates
- **Description:** Track the sponsorship period and derive active/expired status.
- **Goal:** Sponsorships have a period and a clear active/expired status.
- **Acceptance criteria:**
  - [ ] Start and (optional) end date stored.
  - [ ] Active/expired derived from current date.
  - [ ] Status shown in list/detail and used for filtering.
  - [ ] Validation enforces end >= start.
- **Technical notes:** Open-ended sponsorships (no end date) are treated as active. Compute status on read via a shared helper.
- **Dependencies:** Epic 10 #1 Sponsor schema
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:sponsors`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 8: Link sponsors to assets

- **Title:** Link sponsors to assets
- **Description:** Provide UI/mutations to associate sponsors with assets (sponsor-side of Epic 6 #14).
- **Goal:** Staff can attribute assets to sponsors and see those links from the sponsor.
- **Acceptance criteria:**
  - [ ] Link/unlink an asset to a sponsor from the sponsor (or asset) view.
  - [ ] Sponsor detail lists its sponsored assets.
  - [ ] Org-scoped referential integrity enforced.
  - [ ] Permission-gated.
- **Technical notes:** Uses the asset's sponsor reference (Epic 6 #14). Decide whether an asset has at most one sponsor (recommended for MVP).
- **Dependencies:** Epic 10 #1 Sponsor schema, Epic 6 #14 Sponsored asset relationship
- **Labels:** `area:backend`, `area:web`, `area:kittrace`, `type:feature`, `epic:sponsors`
- **Estimated effort:** S (2-4h)

## Issue 9: Public website visibility

- **Title:** Sponsor public website visibility
- **Description:** Control whether each sponsor appears on the public website and expose a public query for visible sponsors.
- **Goal:** Only sponsors marked public appear on the public site.
- **Acceptance criteria:**
  - [ ] Per-sponsor public visibility toggle (staff only).
  - [ ] A public query returns only visible sponsors' safe fields (name, logo, website).
  - [ ] No private contact/value data exposed publicly.
  - [ ] Drives the public sponsors page (Epic 11 #5).
- **Technical notes:** Public query returns a whitelisted projection (consistent with Epic 14 #7). Default visibility off.
- **Dependencies:** Epic 10 #1 Sponsor schema, Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `area:web`, `type:security`, `epic:sponsors`
- **Estimated effort:** S (2-4h)

## Issue 10: Basic sponsor report

- **Title:** Basic sponsor report
- **Description:** A report summarising sponsors, total value, active count, and assets sponsored, with CSV export.
- **Goal:** Staff can review sponsorship contribution and export it.
- **Acceptance criteria:**
  - [ ] Report shows total sponsorship value, active vs expired counts, and assets sponsored.
  - [ ] CSV export of sponsors with value and dates.
  - [ ] Org-scoped and permission-gated.
  - [ ] Handles empty data gracefully.
- **Technical notes:** Aggregates value (Issue 6) and asset links (Issue 8). Reuse the shared CSV utility (Epic 13 #9).
- **Dependencies:** Epic 10 #6 Sponsorship value tracking, Epic 10 #8 Link sponsors to assets
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:sponsors`
- **Estimated effort:** S (2-4h)
