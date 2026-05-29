# Epic 8: QR & NFC Workflows

This epic delivers the scanning experiences that make KitTrace fast in the field: public and authenticated asset lookup routes, web QR scanning, print and batch QR generation, NFC registration and lookup, safe handling of unknown tags, permission checks, and tag reassignment. It ties together the asset model (Epic 6) and operations (Epic 7) with physical tags.

## Issue 1: Public asset lookup route

- **Title:** Public asset lookup route
- **Description:** An unauthenticated route resolvable from a QR code that shows minimal, safe public information about an asset.
- **Goal:** Anyone scanning a QR sees safe, non-sensitive asset info and a path to sign in for more.
- **Acceptance criteria:**
  - [ ] Route `/a/:tagId` resolves a tag id to a public view.
  - [ ] Shows only non-sensitive fields (e.g. asset name, owning club, "report found" prompt).
  - [ ] No custodian, value, medical, or audit data exposed publicly.
  - [ ] Unknown tags handled safely (Issue 8).
- **Technical notes:** Backed by a Convex public query that returns a strictly whitelisted projection. This is the value encoded in QR codes (Epic 6 #8). Must pass the safe-public-route check (Epic 14 #7).
- **Dependencies:** Epic 6 #7 Generate unique asset tag IDs, Epic 6 #8 Generate QR codes
- **Labels:** `area:web`, `area:backend`, `area:kittrace`, `type:security`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 2: Authenticated asset lookup route

- **Title:** Authenticated asset lookup route
- **Description:** A signed-in route that resolves a tag id to the full asset detail (subject to org membership and role).
- **Goal:** Authenticated staff scanning a tag land on the full asset detail for their org.
- **Acceptance criteria:**
  - [ ] Authenticated lookup resolves tag id to the asset detail page.
  - [ ] Enforces org membership and role (Issue 9).
  - [ ] Cross-org tags are denied, not leaked.
  - [ ] Unknown tags handled safely.
- **Technical notes:** Reuses the asset detail page (Epic 6 #5). Lookup query is org-scoped (Epic 2 #7). Differentiates from the public route by auth state.
- **Dependencies:** Epic 8 #1 Public asset lookup route, Epic 6 #5 Asset detail page, Epic 8 #9 Permission checks for tag lookups
- **Labels:** `area:web`, `area:backend`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 3: QR scan web flow

- **Title:** QR scan web flow
- **Description:** An in-app camera-based QR scanner (web) that reads a tag and routes to the appropriate lookup.
- **Goal:** Staff can scan an asset QR from a browser and jump straight to it.
- **Acceptance criteria:**
  - [ ] Camera-based scanner reads the QR and extracts the tag id/URL.
  - [ ] Routes to the authenticated lookup when signed in.
  - [ ] Handles camera permission denial gracefully.
  - [ ] Works on mobile browsers.
- **Technical notes:** Use a maintained browser QR library with `getUserMedia`. Requires HTTPS for camera access. Parse both raw tag ids and full lookup URLs.
- **Dependencies:** Epic 8 #2 Authenticated asset lookup route
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 4: QR print layout

- **Title:** QR print layout
- **Description:** A printer-friendly layout to print a single asset's QR label with name and tag id.
- **Goal:** Staff can print a clean QR label to affix to an asset.
- **Acceptance criteria:**
  - [ ] A print view renders QR, asset name, and tag id at a sensible label size.
  - [ ] Print CSS hides app chrome.
  - [ ] QR error correction suitable for small labels.
  - [ ] Accessible from the asset detail page.
- **Technical notes:** Use `@media print` styles. Keep margins/sizes configurable for common label stock.
- **Dependencies:** Epic 6 #8 Generate QR codes
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 5: QR batch generation

- **Title:** QR batch generation
- **Description:** Generate and print QR labels for many assets at once (e.g. a category or selection).
- **Goal:** Staff can produce a sheet of QR labels for bulk tagging.
- **Acceptance criteria:**
  - [ ] Select multiple assets (or a filter) and generate a grid of labels.
  - [ ] Printable sheet layout (e.g. label grid per page).
  - [ ] Each label includes QR, name, and tag id.
  - [ ] Permission-gated.
- **Technical notes:** Reuse the single label component (Issue 4) in a grid. Consider page-break CSS for multi-page batches.
- **Dependencies:** Epic 8 #4 QR print layout
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 6: NFC registration flow

- **Title:** NFC registration flow
- **Description:** Associate a physical NFC tag with an asset by reading the tag id and storing it.
- **Goal:** Staff can register an NFC tag to an asset.
- **Acceptance criteria:**
  - [ ] Flow reads an NFC tag id and writes it to the asset's NFC field.
  - [ ] Rejects registering an NFC id already used by another asset.
  - [ ] Permission-gated.
  - [ ] Confirmation shown on success.
- **Technical notes:** Web NFC is limited to supported browsers (Chrome on Android); primary registration UX is the iOS app (Epic 12 #7). Reuses the NFC field from Epic 6 #9. Provide a manual-entry fallback.
- **Dependencies:** Epic 6 #9 NFC identifier field
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** M (4-8h)

## Issue 7: NFC lookup flow

- **Title:** NFC lookup flow
- **Description:** Resolve an asset by scanning its NFC tag and route to the asset.
- **Goal:** Staff can tap an NFC tag to open the asset.
- **Acceptance criteria:**
  - [ ] Reading an NFC id resolves to the asset and routes to lookup.
  - [ ] Org/role enforced (Issue 9).
  - [ ] Unknown NFC ids handled safely.
  - [ ] Graceful fallback where NFC is unsupported.
- **Technical notes:** Query by the NFC id index (Epic 6 #9). Primary experience is iOS (Epic 12 #7); web is best-effort.
- **Dependencies:** Epic 8 #6 NFC registration flow, Epic 8 #9 Permission checks for tag lookups
- **Labels:** `area:web`, `area:kittrace`, `type:feature`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 8: Safe fallback for unknown tags

- **Title:** Safe fallback for unknown tags
- **Description:** Handle scans of unrecognised QR/NFC tags with a clear, non-leaky message.
- **Goal:** Unknown tags produce a friendly, safe result rather than an error or data leak.
- **Acceptance criteria:**
  - [ ] Unknown tag id shows a "not found" page with guidance.
  - [ ] No information about other orgs/assets is leaked.
  - [ ] Applies to both public and authenticated lookups.
  - [ ] Logged for diagnostics without exposing details to the user.
- **Technical notes:** Return a uniform not-found regardless of whether the tag exists in another org, to prevent enumeration. Coordinate with Epic 14 #7.
- **Dependencies:** Epic 8 #1 Public asset lookup route, Epic 8 #2 Authenticated asset lookup route
- **Labels:** `area:web`, `area:backend`, `area:kittrace`, `type:security`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 9: Permission checks for tag lookups

- **Title:** Permission checks for tag lookups
- **Description:** Enforce that authenticated tag lookups respect org membership and role, and that public lookups expose only safe data.
- **Goal:** Tag lookups never leak data across orgs or to unauthorised users.
- **Acceptance criteria:**
  - [ ] Authenticated lookup requires membership in the asset's org.
  - [ ] Public lookup returns only whitelisted fields.
  - [ ] Cross-org authenticated lookups are denied uniformly.
  - [ ] Covered by tests (Epic 14).
- **Technical notes:** Centralise in the lookup query/helper. The public projection must be explicitly whitelisted, never a filtered full record. Feeds Epic 14 #3/#7.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries, Epic 8 #1 Public asset lookup route
- **Labels:** `area:backend`, `area:kittrace`, `type:security`, `epic:kittrace`
- **Estimated effort:** S (2-4h)

## Issue 10: Tag reassignment controls

- **Title:** Tag reassignment controls
- **Description:** Allow authorised staff to reassign or clear a QR/NFC tag association (e.g. replacing a damaged tag), recording the change.
- **Goal:** Tags can be safely re-bound to assets with an audit trail.
- **Acceptance criteria:**
  - [ ] Authorised users can clear or reassign an asset's NFC id (and regenerate QR if needed).
  - [ ] Reassignment is recorded in the asset audit log.
  - [ ] Conflicts (NFC id already in use) are rejected.
  - [ ] Permission-gated.
- **Technical notes:** QR encodes the immutable tag id, so QR reassignment means reprinting; NFC ids are mutable and the focus here. Append an audit event (Epic 7 #1) for traceability.
- **Dependencies:** Epic 6 #9 NFC identifier field, Epic 7 #1 Asset audit log schema, Epic 8 #9 Permission checks for tag lookups
- **Labels:** `area:web`, `area:backend`, `area:kittrace`, `type:security`, `epic:kittrace`
- **Estimated effort:** S (2-4h)
