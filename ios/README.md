# GatherHub iOS

Field-operations companion app for the GatherHub community sports club platform.
It focuses on **field ops** — scanning club equipment (QR / NFC), checking kit
in and out, and responding to event RSVPs — not full club administration (that
lives in the web app under `../web`).

- **Backend:** Convex (functions in `../web/convex/*`)
- **Auth:** Clerk, where each Clerk **organisation = one club/tenant**
- **UI:** SwiftUI, iOS 16+, async/await, MVVM-lite

> This directory contains **source only**. There is no checked-in
> `.xcodeproj` — generate it with [XcodeGen](https://github.com/yonaskolb/XcodeGen).
> The Clerk and Convex SDKs are added as Swift Packages **in Xcode** after
> generating, so the project will **not compile until those packages are added**
> (the `import Clerk` / `import ConvexMobile` lines resolve then).

## Setup

### 1. Generate the Xcode project

```sh
brew install xcodegen          # one-time
cd ios
xcodegen generate             # produces GatherHub.xcodeproj
open GatherHub.xcodeproj
```

`project.yml` declares:
- App target **GatherHub**, bundle id **`au.gatherhub.app`**, iOS **16+**, SwiftUI lifecycle.
- An explicit, hand-authored `GatherHub/Info.plist` (camera + NFC usage strings, `gatherhub://` URL scheme).
- The NFC entitlement file `GatherHub/GatherHub.entitlements`.

### 2. Add the Swift Package dependencies (in Xcode)

`project.yml` references these packages, but if XcodeGen can't resolve them
(e.g. offline), add them manually: **File ▸ Add Package Dependencies…**

| Package | URL | Product to add |
| --- | --- | --- |
| Clerk iOS SDK | `https://github.com/clerk/clerk-ios` | `Clerk` |
| Convex Swift client | `https://github.com/get-convex/convex-swift` | `ConvexMobile` |

> Product/symbol names can drift between SDK versions. If Xcode reports an
> unknown product or method, adjust the call sites in
> `GatherHub/Services/ConvexService.swift` and `GatherHub/Services/AuthService.swift`
> — these are the only two files with SDK-specific wiring, and they carry inline
> notes about what to verify.

### 3. Capabilities & Info.plist (already wired, verify in portal)

These are pre-configured in source; you only need to enable the matching App ID
capability in the Apple Developer portal:

- **Camera** — `NSCameraUsageDescription` (Info.plist) for QR scanning.
- **NFC** — `NFCReaderUsageDescription` (Info.plist) **and** the
  `com.apple.developer.nfc.readersession.formats` entitlement
  (`GatherHub.entitlements`). Enable **Near Field Communication Tag Reading**
  for the App ID, then add the **Near Field Communication** capability under
  Signing & Capabilities.
- **URL scheme** — `gatherhub://` (Info.plist) so QR deep links open the app.

### 4. Configure secrets

`GatherHub/Config/Secrets.swift` contains the public Clerk/Convex client
configuration committed with the app. The Google Maps key is intentionally read
from build settings so the open-source repo does not carry a real key.

For local or TestFlight builds, copy the example xcconfig and set the iOS key:

```bash
cp ios/Config/AppSecrets.xcconfig.example ios/Config/AppSecrets.xcconfig
# edit GOOGLE_MAPS_API_KEY in ios/Config/AppSecrets.xcconfig
```

These values are **public by design** (publishable/client keys + deployment
URL); real secrets live in the Convex deployment environment. Use a separate
Google key from the web app, restrict it to the iOS bundle id
`au.com.gatherhub`, and API-restrict it to the Places API you use. Prefer
injecting them via an `.xcconfig` / Info.plist in CI rather than committing
them.

For CI/TestFlight, pass the key as a build setting instead of writing a file:

```bash
xcodebuild \
  -project ios/GatherHub.xcodeproj \
  -scheme GatherHub \
  -configuration Release \
  GOOGLE_MAPS_API_KEY="$IOS_GOOGLE_MAPS_API_KEY" \
  archive
```

The Convex deployment must validate Clerk JWTs from a template named **`convex`**
(see `../web/convex/auth.config.ts`). `AuthService` requests that template when
vending tokens to Convex.

## Backend functions used

The app calls these Convex functions (names match the web client exactly so the
two stay in lockstep). All are Clerk-JWT authenticated.

| Function | Kind | Used by |
| --- | --- | --- |
| `sync:ensureFromClient` | mutation | on login, upsert user/org/membership |
| `sync:currentContext` | query | resolve `{ user, org, role }` |
| `organizations:locationDefaults` | query | default organisation address |
| `organizations:updateLocationSettings` | mutation | admin address setting |
| `taxonomies:list` | query `{ kind }` | asset category picker |
| `tags:lookupAuthed` | query `{ tagId }` | scan / asset lookup |
| `assets:history` | query `{ assetId }` | asset lifecycle trail |
| `assets:create` | mutation | create asset from a scanned NFC tag |
| `assets:list` | query `{ status? }` | checked-out list and bind unknown NFC tag |
| `assets:registerNfc` | mutation | register NFC UID against an asset |
| `assetOps:recordScan` | mutation | audit a successful scan |
| `assetOps:checkOut` | mutation | check out to a custodian |
| `assetOps:checkIn` | mutation | check in |
| `events:list` | query `{ upcomingOnly?, teamId? }` | events tab |
| `events:setRsvp` | mutation `{ eventId, memberId, status }` | RSVP |
| `members:list` | query | custodian / RSVP member resolution |

QR codes encode either `https://app.gatherhub.au/a/tag_xxx` or the deep link
`gatherhub://asset/tag_xxx`; `Utilities/TagParser.swift` extracts the bare
`tag_...` id from any form. Raw NFC hardware UIDs are passed through as opaque
NFC tag ids and can be registered to a new or existing KitTrace asset.

## Screens

- **RootView** — routes between sign-in, org picker, and the main tabs; runs
  `ensureFromClient` + `currentContext` on appear.
- **SignInView** — minimal email/password entry (swap in Clerk's prebuilt UI for production).
- **OrgPickerView** — choose the active club when a user belongs to several.
- **MainTabView** — tabs: **Scan, Assets, Events, Profile**.
- **ScanView** — QR scanning via `AVCaptureSession` + an NFC button via
  `NFCTagReaderSession`; polls ISO 14443 + ISO 15693 tags to match
  Kit-Trace's `flutter_nfc_kit` flow, then navigates to the asset on a
  successful tag read.
- **AssetLookupView / AssetDetailView** — manual lookup and the asset detail
  with **Check Out** (member-picker sheet) / **Check In** actions.
- **MemberPickerView** — searchable custodian picker (`members:list`).
- **EventListView** — upcoming events with a quick **going / maybe / not going** control.
- **ProfileView** — current user, club, role, and sign out.
- **Components/** — `AssetStatusBadge`, `ErrorBanner`, `OfflineStateView`,
  `EmptyStateView` (an iOS-16-compatible stand-in for `ContentUnavailableView`).

## Project layout

```
ios/
├── README.md
├── project.yml                         # XcodeGen spec
└── GatherHub/
    ├── GatherHubApp.swift               # @main, Clerk init, env objects, deep links
    ├── Info.plist                       # camera/NFC usage strings, URL scheme
    ├── GatherHub.entitlements           # NFC reader formats entitlement
    ├── Config/Secrets.swift             # public Clerk/Convex client config
    ├── Config/BuildSettings.xcconfig    # optional local/CI includes
    ├── Config/AppSecrets.xcconfig.example
    ├── Models/Models.swift              # Codable models + snake_case enums
    ├── Services/
    │   ├── ConvexService.swift          # Convex function wrapper
    │   └── AuthService.swift            # Clerk session + JWT provider
    ├── Utilities/TagParser.swift        # extractTagId(from:)
    └── Views/
        ├── RootView.swift
        ├── SignInView.swift
        ├── OrgPickerView.swift
        ├── MainTabView.swift
        ├── ScanView.swift
        ├── AssetLookupView.swift
        ├── AssetDetailView.swift
        ├── MemberPickerView.swift
        ├── EventListView.swift
        ├── ProfileView.swift
        └── Components/
            ├── AssetStatusBadge.swift
            ├── EmptyStateView.swift
            ├── ErrorBanner.swift
            └── OfflineStateView.swift
```

## Notes & assumptions

- **SDK wiring is best-effort.** The Convex/Clerk calls are written against the
  documented APIs; exact method signatures vary by version. They're centralised
  in `ConvexService` / `AuthService` with inline notes so there's one place to
  adjust. The code may not compile until the packages are added and those call
  sites verified.
- **RSVP-as-self.** `currentContext` returns the *user* id, not the caller's
  *member* id, and `events:list` returns only aggregate counts. `EventListView`
  resolves the caller's member record by matching the verified email from
  `members:list`, and tracks the selected RSVP locally. If the backend later
  exposes the member id (or the caller's own RSVP) on context/list, prefer that.
- **Asset actions are role-gated server-side.** `assetOps:checkOut/checkIn`
  require an asset-manager role (owner/admin/committee/coach). The UI surfaces
  this in `ProfileView`, but the server is the source of truth and will reject
  unauthorised calls regardless of the client.
```
