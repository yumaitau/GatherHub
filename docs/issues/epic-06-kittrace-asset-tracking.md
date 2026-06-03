# Epic 6: KitTrace Asset Tracking

KitTrace is GatherHub's asset-tracking module for club equipment and kit. This epic defines the asset data model — categories, status, condition, custodian, location, replacement value, unique tag IDs, QR codes, NFC identifiers, and sponsor links — plus the asset list, detail, and form. Asset operations and the audit log live in Epic 7; QR/NFC workflows in Epic 8.

## Issue 1: Asset schema

- **Title:** Define asset schema
- **Description:** Create the `assets` table capturing identity, category, status, condition, custodian, location, value, and org scoping.
- **Goal:** A typed, indexed `assets` table that is the foundation for KitTrace.
- **Acceptance criteria:**
  - [ ] `assets` table includes org id, name/description, category, status, condition, custodian, location, replacement value, tag id, QR ref, NFC id, optional sponsor link, and timestamps.
  - [ ] Indexed by org id, by tag id (unique), and by status.
  - [ ] Schema validates required fields and enum values.
  - [ ] Soft-delete/retire supported via status.
- **Technical notes:** Several fields are detailed in later issues (category, status, condition, tag, QR, NFC, custodian, location, value, sponsor). Define the table once here with all columns and refine constraints in those issues.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 2: Asset category enum

- **Title:** Asset category enum
- **Description:** Define a category enum (e.g. apparel, equipment, balls, electronics, other) for classifying assets.
- **Goal:** Assets are categorised consistently and filterable by category.
- **Acceptance criteria:**
  - [ ] Category enum defined and centralised.
  - [ ] Category stored on assets and validated.
  - [ ] List filtering by category works.
  - [ ] Includes an "other" fallback.
- **Technical notes:** Share the enum with iOS. Keep extensible; categories are not org-customisable in MVP.
- **Dependencies:** Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 3: Asset status enum

- **Title:** Asset status enum
- **Description:** Define the lifecycle status enum (available, checked_out, in_maintenance, lost, retired).
- **Goal:** Asset state is explicit and drives operations and dashboards.
- **Acceptance criteria:**
  - [ ] Status enum defined: available, checked_out, in_maintenance, lost, retired.
  - [ ] Status stored on assets and validated.
  - [ ] List filtering by status works.
  - [ ] Status transitions are constrained (enforced in Epic 7 operations).
- **Technical notes:** Operations in Epic 7 mutate status. Document the valid transition graph (e.g. retired is terminal) for the audit/operation mutations.
- **Dependencies:** Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 4: Asset list page

- **Title:** Asset list page
- **Description:** A searchable, filterable table of assets for the active organisation.
- **Goal:** Staff can browse, search, and filter the asset inventory.
- **Acceptance criteria:**
  - [ ] Table shows name, category, status, condition, custodian, and location.
  - [ ] Search by name/tag and filter by category/status.
  - [ ] Pagination or virtualised loading.
  - [ ] Row click navigates to asset detail.
- **Technical notes:** Use the shadcn-style Table. Status shown as a coloured badge. Org-scoped query.
- **Dependencies:** Epic 6 #1 Asset schema, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 5: Asset detail page

- **Title:** Asset detail page
- **Description:** A single-asset view showing all attributes, QR code, current custodian/location, sponsor, and entry points to operations and history.
- **Goal:** A complete, actionable single-asset overview.
- **Acceptance criteria:**
  - [ ] Displays all asset fields including category, status, condition, value, custodian, location.
  - [ ] Shows the QR code and tag id.
  - [ ] Shows sponsor (if linked) and a placeholder for history (Epic 7 #8).
  - [ ] Operation actions (check-out/in, transfer, etc.) visible per role.
- **Technical notes:** History and operation buttons integrate with Epic 7. QR rendering integrates with Epic 6 #8 / Epic 8.
- **Dependencies:** Epic 6 #1 Asset schema, Epic 6 #8 Generate QR codes
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 6: Asset form

- **Title:** Asset create/edit form
- **Description:** A validated form to create and edit assets, including category, condition, value, custodian, location, and sponsor.
- **Goal:** Staff can add and update assets with validation.
- **Acceptance criteria:**
  - [ ] Create/edit share a validated form covering all editable fields.
  - [ ] Tag id auto-generated on create (Issue 7), not user-entered.
  - [ ] Submits to org-scoped mutations.
  - [ ] Permission-gated to asset managers.
- **Technical notes:** Replacement value is currency; validate numeric/non-negative. Sponsor and NFC fields integrate with Issues 14 and 9.
- **Dependencies:** Epic 6 #1 Asset schema, Epic 6 #7 Generate unique asset tag IDs, Epic 1 #5 Configure component library
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 7: Generate unique asset tag IDs

- **Title:** Generate unique asset tag IDs
- **Description:** Generate a human-readable, collision-resistant tag id for each asset on creation, unique within the organisation.
- **Goal:** Every asset has a stable, unique, printable tag id.
- **Acceptance criteria:**
  - [ ] Tag id generated server-side on asset creation.
  - [ ] Uniqueness enforced (unique index) within the org.
  - [ ] Format is short and human-readable (e.g. prefix + base32).
  - [ ] Tag id is immutable after creation.
- **Technical notes:** Generate in the create mutation, not the client. Consider an org prefix plus a random/sequential suffix. The tag id is what QR/NFC encode and what public lookup resolves (Epic 8).
- **Dependencies:** Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 8: Generate QR codes

- **Title:** Generate QR codes for assets
- **Description:** Produce a scannable QR code per asset that encodes a lookup URL/tag id.
- **Goal:** Each asset has a renderable, printable QR code.
- **Acceptance criteria:**
  - [ ] QR encodes the asset lookup URL containing the tag id.
  - [ ] QR renders on the asset detail page.
  - [ ] QR is downloadable as an image.
  - [ ] Stable across re-renders for a given asset.
- **Technical notes:** Use a client-side QR library to avoid storage; the encoded value is the public lookup route (Epic 8 #1). Ensure sufficient error correction for printing.
- **Dependencies:** Epic 6 #7 Generate unique asset tag IDs
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 9: NFC identifier field

- **Title:** NFC identifier field
- **Description:** Store an optional NFC tag identifier on an asset to support NFC-based lookup.
- **Goal:** Assets can be associated with a physical NFC tag id.
- **Acceptance criteria:**
  - [ ] Nullable NFC id field on the asset, unique within org when set.
  - [ ] Editable via the asset form / NFC registration flow.
  - [ ] Lookup by NFC id supported in queries.
  - [ ] Validation prevents duplicate NFC ids.
- **Technical notes:** Registration UX lives in Epic 8 #6; this issue covers the data field and uniqueness. NFC id format depends on tag hardware (store as string).
- **Dependencies:** Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 10: Asset condition tracking

- **Title:** Asset condition tracking
- **Description:** Track asset condition (e.g. new, good, fair, poor, damaged) and allow updates.
- **Goal:** Asset condition is recorded and visible, informing maintenance/retirement.
- **Acceptance criteria:**
  - [ ] Condition enum defined and stored on the asset.
  - [ ] Condition editable via form and surfaced on detail/list.
  - [ ] Condition changes are auditable (via Epic 7 operations where relevant).
  - [ ] Validation enforces enum values.
- **Technical notes:** Maintenance operations (Epic 7 #6) may update condition. Keep enum centralised and shared with iOS.
- **Dependencies:** Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 11: Current custodian field

- **Title:** Current custodian field
- **Description:** Track which member currently holds/owns responsibility for an asset.
- **Goal:** Each asset shows its current custodian, updated by check-out/transfer operations.
- **Acceptance criteria:**
  - [ ] Nullable custodian reference (to a member) on the asset.
  - [ ] Displayed on detail/list.
  - [ ] Updated by check-out/transfer/check-in operations (Epic 7).
  - [ ] Cleared on check-in/retire as appropriate.
- **Technical notes:** Custodian is derived from operations; the field is the current denormalised pointer while the audit log holds history. Validate the custodian belongs to the same org.
- **Dependencies:** Epic 6 #1 Asset schema, Epic 3 #1 Create member schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 12: Current location field

- **Title:** Current location field
- **Description:** Track the asset's current physical location (e.g. clubhouse, storage, with custodian).
- **Goal:** Each asset shows its current location, updated by operations.
- **Acceptance criteria:**
  - [ ] Location field on the asset (free text or location enum/list).
  - [ ] Displayed on detail/list.
  - [ ] Updated by relevant operations (transfer, check-in).
  - [ ] Optional but recommended on creation.
- **Technical notes:** For MVP, a free-text or simple predefined list of locations is sufficient. Consider an org-managed location list later.
- **Dependencies:** Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 13: Replacement value field

- **Title:** Replacement value field
- **Description:** Store the monetary replacement value of an asset for insurance/reporting.
- **Goal:** Asset value is recorded and aggregable for reporting.
- **Acceptance criteria:**
  - [ ] Replacement value stored as a non-negative numeric/currency field.
  - [ ] Editable via form and shown on detail.
  - [ ] Aggregable for value-at-risk reporting (lost/checked-out totals).
  - [ ] Validation rejects negative values.
- **Technical notes:** Store minor units (cents) to avoid float issues, with a currency assumption per org for MVP. Feeds Epic 7 #11 and Epic 13 widgets.
- **Dependencies:** Epic 6 #1 Asset schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`, `good-first-issue`
- **Estimated effort:** XS (1-2h)

## Issue 14: Sponsored asset relationship

- **Title:** Sponsored asset relationship
- **Description:** Link an asset to a sponsor (Epic 10) to record which sponsor funded it.
- **Goal:** Assets can be attributed to a sponsor and surfaced in sponsor reporting.
- **Acceptance criteria:**
  - [ ] Nullable sponsor reference on the asset.
  - [ ] Settable via the asset form and the sponsor linking flow (Epic 10 #8).
  - [ ] Sponsor shown on asset detail.
  - [ ] Validation ensures the sponsor belongs to the same org.
- **Technical notes:** This is the asset-side of the relationship; the sponsor-side listing is Epic 10 #8. Keep referential integrity within org scope.
- **Dependencies:** Epic 6 #1 Asset schema, Epic 10 #1 Sponsor schema
- **Labels:** `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)
