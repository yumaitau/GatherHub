# Epic 12: iOS App

This epic delivers the GatherHub iOS app in SwiftUI, focused on field use of KitTrace and events: Clerk authentication, the Convex Swift client, organisation selection, asset lookup, QR and NFC scanning, asset check-out/in, the event list and RSVP, and offline-friendly error states. It mirrors the backend contracts established in Epics 2, 6, 7, and 8.

## Issue 1: SwiftUI app project

- **Title:** Scaffold the SwiftUI app project
- **Description:** Create the Xcode SwiftUI project under `ios/` with app structure, navigation, and build configuration.
- **Goal:** A buildable SwiftUI app shell that runs on the simulator.
- **Acceptance criteria:**
  - [ ] Xcode project under `ios/` builds and runs on the simulator.
  - [ ] Basic navigation/tab structure scaffolded.
  - [ ] Build settings and bundle id configured; min iOS version set.
  - [ ] Config values (Clerk key, Convex URL) read from a config/plist, not hardcoded.
- **Technical notes:** Use SwiftUI App lifecycle. Keep config in a plist/xcconfig referencing the documented env values (Epic 1 #8). Do not commit secrets.
- **Dependencies:** Epic 1 #1 Initialise monorepo
- **Labels:** `area:ios`, `type:chore`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 2: Clerk iOS authentication

- **Title:** Clerk iOS authentication
- **Description:** Integrate the Clerk iOS SDK for sign-in/sign-out and session management.
- **Goal:** Users can authenticate in the app and obtain a session token for Convex.
- **Acceptance criteria:**
  - [ ] Sign-in and sign-out flows work via the Clerk iOS SDK.
  - [ ] Authenticated session token is retrievable for Convex calls.
  - [ ] Session persists across launches.
  - [ ] Auth gate hides app content until signed in.
- **Technical notes:** Configure the Clerk publishable key from app config. The token feeds the Convex client auth (Issue 3). Handle token refresh.
- **Dependencies:** Epic 12 #1 SwiftUI app project, Epic 1 #7 Configure Clerk
- **Labels:** `area:ios`, `area:auth`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 3: Convex Swift client

- **Title:** Integrate Convex Swift client
- **Description:** Add the Convex Swift client, wire it to the Clerk auth token, and verify a sample query.
- **Goal:** The app can call authenticated Convex queries/mutations.
- **Acceptance criteria:**
  - [ ] Convex Swift client configured with the deployment URL.
  - [ ] Clerk token supplied to Convex for authenticated calls.
  - [ ] A sample authenticated query returns data.
  - [ ] Errors surface to the UI.
- **Technical notes:** Bridge the Clerk token provider into the Convex client auth. Reuse backend functions; no iOS-specific backend needed beyond existing queries.
- **Dependencies:** Epic 12 #2 Clerk iOS authentication, Epic 1 #6 Configure Convex
- **Labels:** `area:ios`, `area:backend`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 4: Organisation selection

- **Title:** Organisation selection
- **Description:** Let users pick the active organisation in the app, mirroring web org switching.
- **Goal:** The active org is selectable and scopes all app data.
- **Acceptance criteria:**
  - [ ] User can view their orgs and select an active one.
  - [ ] Active org scopes subsequent queries.
  - [ ] Single-org users default automatically.
  - [ ] "No organisation" state handled.
- **Technical notes:** Mirror Epic 2 #2 behaviour. Active org must propagate via the Clerk token claim consumed by Convex.
- **Dependencies:** Epic 12 #3 Convex Swift client, Epic 2 #2 Implement organisation switcher
- **Labels:** `area:ios`, `area:auth`, `type:feature`, `epic:ios`
- **Estimated effort:** S (2-4h)

## Issue 5: Authenticated asset lookup

- **Title:** Authenticated asset lookup
- **Description:** Resolve a tag id to an asset detail view within the app for the active org.
- **Goal:** Users can look up an asset by tag id and view its details.
- **Acceptance criteria:**
  - [ ] Entering/scanning a tag id resolves to the asset for the active org.
  - [ ] Detail view shows status, custodian, location, condition, and value.
  - [ ] Cross-org/unknown tags handled safely.
  - [ ] Permission-respecting (server-enforced).
- **Technical notes:** Reuses the authenticated lookup query (Epic 8 #2/#9). Feeds the scanners (Issues 6-7) and operation flows (Issues 8-9).
- **Dependencies:** Epic 12 #3 Convex Swift client, Epic 8 #2 Authenticated asset lookup route
- **Labels:** `area:ios`, `area:kittrace`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 6: QR scanner

- **Title:** QR scanner
- **Description:** A camera-based QR scanner that reads an asset tag and opens its detail.
- **Goal:** Users can scan an asset QR to jump to it.
- **Acceptance criteria:**
  - [ ] Camera QR scanner reads the tag id/URL.
  - [ ] Routes to the asset lookup view.
  - [ ] Handles camera permission denial gracefully.
  - [ ] Parses both raw tag ids and lookup URLs.
- **Technical notes:** Use AVFoundation metadata capture for QR. Request camera permission with a clear usage string in Info.plist.
- **Dependencies:** Epic 12 #5 Authenticated asset lookup
- **Labels:** `area:ios`, `area:kittrace`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 7: NFC scanner

- **Title:** NFC scanner
- **Description:** Read an NFC tag to resolve and open the associated asset.
- **Goal:** Users can tap an NFC tag to open the asset.
- **Acceptance criteria:**
  - [ ] Core NFC reads the tag id.
  - [ ] Resolves to the asset via the NFC lookup query.
  - [ ] Unknown NFC ids handled safely.
  - [ ] Graceful messaging on unsupported devices.
- **Technical notes:** Use Core NFC (requires the NFC entitlement and a capable device). Reuses Epic 8 #7 lookup. NFC is the primary registration/lookup surface vs limited web NFC.
- **Dependencies:** Epic 12 #5 Authenticated asset lookup, Epic 8 #7 NFC lookup flow
- **Labels:** `area:ios`, `area:kittrace`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 8: Asset check-out flow

- **Title:** Asset check-out flow (iOS)
- **Description:** Check an asset out to a custodian from the app, with optional due date.
- **Goal:** Users can check out an asset in the field with an audit trail.
- **Acceptance criteria:**
  - [ ] From an asset, select a custodian and optional due date and confirm check-out.
  - [ ] Calls the check-out mutation; UI reflects the new status.
  - [ ] Errors (not available, no permission) surfaced clearly.
  - [ ] Server-enforced permissions respected.
- **Technical notes:** Reuses the check-out mutation (Epic 7 #2). Custodian picker scoped to org members.
- **Dependencies:** Epic 12 #5 Authenticated asset lookup, Epic 7 #2 Check-out mutation
- **Labels:** `area:ios`, `area:kittrace`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 9: Asset check-in flow

- **Title:** Asset check-in flow (iOS)
- **Description:** Check an asset back in from the app, optionally updating location/condition.
- **Goal:** Users can check in an asset in the field with an audit trail.
- **Acceptance criteria:**
  - [ ] From a checked-out asset, confirm check-in with optional location/condition.
  - [ ] Calls the check-in mutation; UI reflects the new status.
  - [ ] Errors surfaced clearly.
  - [ ] Server-enforced permissions respected.
- **Technical notes:** Reuses the check-in mutation (Epic 7 #3). Pair with the QR/NFC scanners for fast field check-in.
- **Dependencies:** Epic 12 #5 Authenticated asset lookup, Epic 7 #3 Check-in mutation
- **Labels:** `area:ios`, `area:kittrace`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)

## Issue 10: Event list

- **Title:** Event list (iOS)
- **Description:** Show upcoming events for the active org and the user's teams.
- **Goal:** Users can browse upcoming events in the app.
- **Acceptance criteria:**
  - [ ] Lists upcoming events with title, type, date, location, and team.
  - [ ] Org-scoped and relevant to the user.
  - [ ] Tap navigates to event detail.
  - [ ] Empty state when none.
- **Technical notes:** Reuses event queries (Epic 4 #1/#9). Mirror web filtering minimally for MVP.
- **Dependencies:** Epic 12 #3 Convex Swift client, Epic 4 #1 Event schema
- **Labels:** `area:ios`, `type:feature`, `epic:ios`
- **Estimated effort:** S (2-4h)

## Issue 11: Attendance RSVP

- **Title:** Attendance RSVP (iOS)
- **Description:** Let users set their RSVP status for an event from the app.
- **Goal:** Users can RSVP to events on mobile.
- **Acceptance criteria:**
  - [ ] RSVP control (going/maybe/not going) on the event detail.
  - [ ] Calls the RSVP mutation and reflects the result.
  - [ ] Errors surfaced clearly.
  - [ ] Respects server-side rules.
- **Technical notes:** Reuses the RSVP mutation (Epic 4 #6). Optimistic update optional.
- **Dependencies:** Epic 12 #10 Event list, Epic 4 #6 RSVP mutation
- **Labels:** `area:ios`, `type:feature`, `epic:ios`
- **Estimated effort:** S (2-4h)

## Issue 12: Offline-friendly error states

- **Title:** Offline-friendly error states
- **Description:** Provide clear handling for offline/connectivity issues and failed requests across the app.
- **Goal:** The app degrades gracefully when offline or on a poor connection.
- **Acceptance criteria:**
  - [ ] Network failures show a clear, retryable message.
  - [ ] Read views show last-known data where available (or a clear offline notice).
  - [ ] Mutations queue or fail clearly without silent loss.
  - [ ] No crashes on connectivity loss.
- **Technical notes:** Convex provides live updates when connected; for MVP, focus on clear errors and retry rather than full offline sync. Avoid silently dropping writes; surface failures.
- **Dependencies:** Epic 12 #3 Convex Swift client
- **Labels:** `area:ios`, `type:feature`, `epic:ios`
- **Estimated effort:** M (4-8h)
