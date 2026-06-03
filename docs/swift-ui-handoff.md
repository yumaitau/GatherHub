# GatherHub — Swift / SwiftUI Handoff

This document is the single source of truth for the iOS team building a
native Swift/SwiftUI client against the GatherHub Convex backend. It is
self-contained: a Swift engineer who has never seen this repo should be able
to ship feature parity with the web client using only this document plus the
Convex Swift SDK docs.

## 1. Purpose + scope

Covers: product orientation; architecture; auth model and typed error
codes; OKLCH → SwiftUI design-token mapping; complete schema reference;
every exported Convex query / mutation / action by feature; end-to-end
data-flow recipes; public / unauthenticated surfaces; error rendering
catalogue; iOS v1 deferrals and security-review gaps.

Out of scope (mirror the web, do not redesign): the brand and palette; the
data model (authoritative in `web/convex/schema.ts`); role hierarchy and
permission semantics (enforced server-side in `web/convex/lib/auth.ts` —
UI gating is convenience, not security); tag id format and the `/a/:tagId`
public surface.

## 2. Product orientation

GatherHub is the operating system for community sports clubs and
volunteer-run organisations. Primary user: the **committee admin at a
desk** — a volunteer treasurer/secretary opening the tool at 9pm to
answer a specific question (who has the U13 keeper jersey, who hasn't paid
subs, who is rostered Saturday) and to log an honest action. Secondary:
coaches marking attendance on a phone at training, volunteers scanning
kit pitch-side via iOS, parents/players reading public info. Sessions
are short, frequent, interrupted (see `PRODUCT.md`).

Brand personality: **Trustworthy. Calm. Sharp.** Trustworthy because
volunteers handle member data, money, and child safeguarding. Calm
because users arrive tired; routine work should not raise the
temperature. Sharp because they are competent adults with limited time.
System disposition: "The Quiet Operator" — the interface disappears into
the task. GatherHub is explicitly **not** Spond / TeamSnap / Heja (no
chat-thread-first IA, no consumer-y baby-blue, no emoji reactions on
operational records), nor the generic SaaS dashboard template (no
purple-pink gradients, no hero-metric tiles, no glassmorphism), nor
crypto / AI-startup neon, nor a Bootstrap-density enterprise admin
panel, nor marketing voice (see `PRODUCT.md` § Anti-references). Voice:
plain, second-person, present tense.

## 3. Architecture overview

Monorepo with three deployable surfaces sharing one Convex backend
(`web/convex/`). Both web and iOS talk **directly** to Convex over a
Clerk-authenticated session — there is no REST API tier in between.

- **Identity:** Clerk (iOS SDK). JWT carries subject, email, name, picture
  only.
- **Backend:** Convex (queries, mutations, websocket subscriptions) plus
  Cloudflare R2 object storage for uploaded files. Convex verifies the Clerk JWT
  on every call; identity is available via `ctx.auth.getUserIdentity()`.
- **Multi-tenancy:** clubs (`organizations`) and `memberships` are
  Convex-native; Clerk Organizations are not used. The active org lives on
  `users.activeOrgId` and is switched via `organizations.setActive`. The
  client **never** passes an `orgId`; the server resolves it from
  `activeOrgId` and validates against `memberships` on every call. Single
  chokepoint for tenant isolation.

Cross-refs: `docs/architecture.md` (system overview, JWT flow, deployment),
`docs/mobile-architecture.md` (iOS app structure, scan + asset flows,
screen list), `docs/security-model.md` (`requireOrgMember`, permissions
matrix, public QR rules, file-upload validation, data minimisation).

## 4. Auth model

### 4.1 Role hierarchy

Stored on `memberships.role`. Ranks from `web/convex/lib/auth.ts`:

| Role | Rank |
| --- | --- |
| `owner` | 100 |
| `admin` | 90 |
| `committee` | 70 |
| `coach` | 50 |
| `volunteer` | 40 |
| `parent` | 30 |
| `player` | 20 |

`coach`, `volunteer`, `parent`, `player` are parallel operational roles;
the rank exists so committee+ checks stay simple. Server-side guards:
`requireUser`, `requireOrgMember`, `requireRole(min)`,
`requireAnyRole([...])`, `assertSameOrg(auth, doc)`.

### 4.2 Typed error codes

Defined in `web/convex/lib/auth.ts` (`AuthErrorCode`). Each guard's
`ConvexError` carries `data: { code, message }`. Web reference:
`web/src/lib/errors.ts` (`parseAuthError`). Route on `code`, not
`message`.

| Code | When | iOS affordance |
| --- | --- | --- |
| `unauthenticated` | No Clerk session, or `users` mirror not yet synced | Silent token refresh first; if it fails, drop to `SignInView`. |
| `no_active_org` | Signed in, `users.activeOrgId` unset | Push `OrgPickerView`. |
| `not_member` | Active org set but caller no longer in `memberships` | `OrgPickerView` with banner "You're no longer a member of that club." Clear local `activeOrgId`. |
| `forbidden` | Member, missing role | Access-denied state on the current route; body = error `message`. Don't auto-navigate back. |
| `not_found` | Record absent **or** belongs to another org | Single "Not found" empty state. Do **not** distinguish absent vs cross-org — the server deliberately collapses them (`assertSameOrg`). iOS must not leak the distinction (no "another club's record" copy). |

### 4.3 Sign-in / sign-up

Use the **Clerk iOS SDK** with the production publishable key. Sign-in
methods are whatever Clerk has enabled (email + password, OAuth, magic
link / OTP). Mint a session JWT via the `convex` template and pass a
token-fetch closure to the Convex Swift client. See
`docs/mobile-architecture.md` § 2 for the `ConvexClient` wiring.

JWT claims are identity only. The active club is read from
`users.activeOrgId` via `sync.currentContext` and switched via
`organizations.setActive`; that mutation causes all live Convex queries to
re-fetch under the new scope.

## 5. Design system mapping

Source: `DESIGN.md`. Everything OKLCH is the canonical truth in the web
codebase. The iOS app should mirror tonal relationships, not pixel-match.

### 5.1 Colour tokens (OKLCH → sRGB)

Light + dark variants from `DESIGN.md` frontmatter. The sRGB hex column is
the perceptually-closest sRGB representation (oklch → linear-RGB → sRGB,
clamped). Re-verify in a design tool if you change them.

| Token | Light OKLCH | Light sRGB | Dark OKLCH | Dark sRGB |
| --- | --- | --- | --- | --- |
| `paper` | `oklch(99% 0.003 250)` | `#FCFCFD` | `oklch(15% 0.010 250)` | `#1E2026` |
| `surface` | `oklch(98% 0.004 250)` | `#F9FAFB` | `oklch(18% 0.012 250)` | `#24272E` |
| `surface-sunk` | `oklch(96.5% 0.006 250)` | `#F3F4F7` | `oklch(12.5% 0.010 250)` | `#181B22` |
| `surface-raised` | `oklch(99.5% 0.002 250)` | `#FDFDFE` | `oklch(21% 0.014 250)` | `#2A2D35` |
| `border-hairline` | `oklch(93% 0.008 250)` | `#E7E8EE` | `oklch(22% 0.014 250)` | `#2C3038` |
| `border` | `oklch(88% 0.010 250)` | `#D6D8E0` | `oklch(28% 0.016 250)` | `#383C45` |
| `border-strong` | `oklch(80% 0.012 250)` | `#BEC1CC` | `oklch(36% 0.018 250)` | `#494E58` |
| `ink-quiet` | `oklch(48% 0.014 250)` | `#646874` | `oklch(58% 0.014 250)` | `#7E8390` |
| `ink-soft` | `oklch(36% 0.018 250)` | `#494D58` | `oklch(72% 0.016 250)` | `#A4A9B5` |
| `ink` | `oklch(22% 0.020 250)` | `#2A2D38` | `oklch(88% 0.012 250)` | `#D2D6DF` |
| `ink-strong` | `oklch(14% 0.020 250)` | `#1A1D27` | `oklch(96% 0.008 250)` | `#EEF0F5` |
| `accent` | `oklch(38% 0.080 250)` | `#3F4F7A` | `oklch(72% 0.090 250)` | `#94AAD8` |
| `accent-hover` | `oklch(32% 0.085 250)` | `#33426A` | `oklch(78% 0.095 250)` | `#A6BAE5` |
| `accent-active` | `oklch(28% 0.085 250)` | `#2B385D` | `oklch(82% 0.095 250)` | `#B5C4EB` |
| `accent-wash` | `oklch(94% 0.025 250)` | `#E5EAF4` | `oklch(28% 0.045 250)` | `#373D52` |
| `accent-ink` | `oklch(98% 0.003 250)` | `#F9FAFB` | `oklch(14% 0.020 250)` | `#1A1D27` |
| `success` | `oklch(48% 0.100 155)` | `#1F7A4F` | `oklch(68% 0.100 155)` | `#5BB389` |
| `success-wash` | `oklch(94% 0.040 155)` | `#DCF1E6` | — | — |
| `warning` | `oklch(60% 0.130 70)` | `#B2761A` | `oklch(76% 0.130 70)` | `#DA9D4C` |
| `warning-wash` | `oklch(94% 0.060 75)` | `#F4E5C9` | — | — |
| `danger` | `oklch(48% 0.160 25)` | `#A8331F` | `oklch(68% 0.140 25)` | `#D87263` |
| `danger-wash` | `oklch(94% 0.050 25)` | `#F4DDD7` | — | — |
| `info` | `oklch(45% 0.070 235)` | `#3A5E80` | `oklch(70% 0.080 235)` | `#88A6C5` |
| `info-wash` | `oklch(94% 0.030 235)` | `#DCE7EF` | — | — |

Wash tokens (`*-wash`) on dark mode follow the accent-wash pattern: a
low-chroma surface tint, never a saturated fill. For status dark washes,
derive at runtime as the status hue at `28% L, 0.045 C`.

### 5.2 `Color+GatherHub.swift` skeleton

One extension, semantic tokens resolved per `ColorScheme`. Do **not**
hard-code light values into views.

```swift
extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >>  8) & 0xFF) / 255,
            blue:  Double( hex        & 0xFF) / 255,
            opacity: opacity)
    }
}

enum GHColor {
    static func paper(_ s: ColorScheme) -> Color {
        s == .dark ? Color(hex: 0x1E2026) : Color(hex: 0xFCFCFD)
    }
    static func surface(_ s: ColorScheme) -> Color {
        s == .dark ? Color(hex: 0x24272E) : Color(hex: 0xF9FAFB)
    }
    static func ink(_ s: ColorScheme) -> Color {
        s == .dark ? Color(hex: 0xD2D6DF) : Color(hex: 0x2A2D38)
    }
    static func accent(_ s: ColorScheme) -> Color {
        s == .dark ? Color(hex: 0x94AAD8) : Color(hex: 0x3F4F7A)
    }
    // ...etc. for every token in the table above.
}
```

### 5.3 Typography

Web uses **Inter Variable** (`DESIGN.md` § 3). On iOS:

- **Default (v1):** SF Pro Display / SF Pro Text. System rendering,
  optical sizing, Dynamic Type, `.monospacedDigit()` for tabular.
- **Optional:** bundle Inter Variable for visual parity at the cost of
  re-applying Dynamic Type. Decide once, do not mix.

Type scale (static sizes scale via `.dynamicTypeSize`):

| Web role | Web spec | iOS `Font` | Dynamic Type role |
| --- | --- | --- | --- |
| Display | 600, 28 / 34, -0.015em | `.system(size: 28, weight: .semibold)` | `.largeTitle` |
| Headline | 600, 22 / 28, -0.012em | `.system(size: 22, weight: .semibold)` | `.title2` |
| Title | 600, 17 / 24, -0.008em | `.system(size: 17, weight: .semibold)` | `.headline` |
| Body | 400, 14 / 22, -0.003em | `.system(size: 14, weight: .regular)` | `.subheadline` |
| Body Strong | 550, 14 / 22 | `.system(size: 14, weight: .medium)` | `.subheadline` (bold) |
| Caption | 400, 12 / 18 | `.system(size: 12, weight: .regular)` | `.caption` |
| Label | 600, 11, 0.04em tracking, UPPERCASE | `.system(size: 11, weight: .semibold).tracking(0.44)` | `.caption2` (uppercased manually) |
| Numeric | 500 tabular, 14 / 22 | `.system(size: 14, weight: .medium).monospacedDigit()` | `.subheadline` |
| Mono | 450, 13 / 20 | `.system(.footnote, design: .monospaced)` | `.footnote` |

**Label Restraint Rule** ports verbatim: uppercase Label only in form
labels, table headers, section dividers — never body, button, or dialog
titles. **Tabular Numerics Rule** ports verbatim: every column, total,
badge count, money figure, attendance count uses `.monospacedDigit()`.

### 5.4 Motion

Durations and curve from `DESIGN.md` § 1 / § 6: fast 150ms, base 180ms,
slow 220ms. Web curve ease-out-quart; SwiftUI nearest is `.easeOut` or for
closer fidelity `.timingCurve(0.22, 1, 0.36, 1, duration:)`.

```swift
extension Animation {
    static let ghFast = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.15)
    static let ghBase = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.18)
    static let ghSlow = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.22)
}
```

**Bans** (`DESIGN.md` § 6): no bounce, no `.spring()` with visible
overshoot, no scroll-driven reveal, no hover choreography, no decorative
motion. Respect `accessibilityReduceMotion`: shorten essentials to ~100ms
opacity-only; disable non-essentials.

### 5.5 Spacing scale

From `DESIGN.md` frontmatter. SwiftUI uses pt as its unit (1pt ≈ 1px on
non-retina); reuse the same numbers directly.

| Token | px / pt |
| --- | --- |
| `px` | 1 |
| `half` | 2 |
| `1` | 4 |
| `2` | 8 |
| `3` | 12 |
| `4` | 16 |
| `5` | 20 |
| `6` | 24 |
| `7` | 32 |
| `8` | 40 |
| `9` | 48 |
| `10` | 64 |

Radii: `xs` 4, `sm` 6, `md` 8, `lg` 12, `pill` 9999.

### 5.6 Component primitives

```swift
// Card — Surface fill, 1px hairline border, 8pt radius, 16pt padding.
struct GHCard<C: View>: View {
    @Environment(\.colorScheme) private var s
    @ViewBuilder var content: () -> C
    var body: some View {
        content().padding(16)
            .background(GHColor.surface(s))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8)
                .strokeBorder(GHColor.borderHairline(s), lineWidth: 1))
    }
}

// Badge / chip — pill, 22pt, leading 6pt status dot, caption label.
struct GHBadge: View {
    let label: String; let icon: String?; let tone: Tone
    enum Tone { case neutral, accent, success, warning, danger }
    var body: some View { /* HStack(dot, icon?, Text(label)) in Capsule */ EmptyView() }
}

// PageHeader — Display weight title + optional caption, no decoration.
struct GHPageHeader: View {
    let title: String; let caption: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 28, weight: .semibold))
            if let caption { Text(caption).font(.system(size: 14)).foregroundStyle(.secondary) }
        }
    }
}

// EmptyState — Body-Strong title + Body context + one Secondary button.
// Centred, max 360pt. No illustration. Reserved tone, no exclamation marks.
struct GHEmptyState: View { let title: String; let body: String; let action: (String, () -> Void)? }
```

### 5.7 Absolute bans (port to iOS)

From `DESIGN.md` § 6 Don'ts and the impeccable rules:

- No side-stripe borders > 1pt. Use a hairline border, tonal wash, or
  leading status dot.
- No gradient text or `LinearGradient` on `.foregroundStyle` for type.
- No glassmorphism (`.ultraThinMaterial`) as decoration. Allowed only as a
  scrim for a command-palette-equivalent.
- No hero-metric tile grid as the home screen. Home is a workload-shaped
  list.
- No identical icon-and-heading card grids.
- No modal-as-first-thought: a `.sheet` is not the answer to every create
  flow. Prefer push navigation; reserve sheets for genuine overlay edits.

## 6. Schema reference

Authoritative: `web/convex/schema.ts`. Every tenant-owned table carries
`orgId: Id<"organizations">`. Every document has automatic `_id` and
`_creationTime` (epoch ms). Timestamps are **epoch milliseconds** unless
noted as ISO `yyyy-mm-dd`. Indexes elided below — read `schema.ts` for
the full set; the auth model only needs the `by_org*` indexes anyway.

- **taxonomies** — per-org configurable lists. `events.type`,
  `assets.category`, `assets.condition`, `teams.ageGroup` store the `key`
  string and are validated on write via `assertTaxonomyKey`.
  `orgId`, `kind` (`event_type|asset_category|asset_condition|team_age_group`),
  `key` (immutable once referenced), `label`, `order`, `active`,
  `isDefault?`, `color?`.
- **users** — global (not org-scoped). `clerkUserId` (unique), `email?`,
  `firstName?`, `lastName?`, `imageUrl?`,
  `activeOrgId?: Id<"organizations">`.
- **organizations** — Convex-native clubs. `name`, `slug?`, `imageUrl?`,
  `createdBy`, `inviteCode?` (opaque code for `joinByCode`), `soccerMode?`.
- **memberships** — `orgId`, `userId`, `role`.
- **invitations** — `orgId`, `email` (lowercased), `role`, `code`,
  `invitedByUserId`, `expiresAt` (epoch ms, 7-day TTL), `acceptedAt?`,
  `acceptedByUserId?`, `revokedAt?`.
- **joinAttempts** — append-only rate-limit log. `userId`, `attemptedAt`,
  `success`. 5 attempts / 60s window.
- **members** — person in a club; may or may not be a `user`. `orgId`,
  `userId?`, `firstName`, `lastName`, `email?`, `phone?`,
  `dateOfBirth?` (ISO), `status` (`active|inactive`), `notes?`,
  `isVolunteer`, `volunteerSkills?: string[]`, `volunteerAvailability?`,
  `volunteerNotes?`, `isLifetimeMember?`, `lifetimeMemberSince?`,
  `lifetimeMemberNotes?`, `lifetimeMemberFirstAddedToClub?`,
  `lifetimeMemberAddedBy?`, `clubRole?` (free string: "coach", "manager",
  etc.).
- **guardians** — `orgId`, `memberId` (child), `guardianMemberId`,
  `relationship?`.
- **emergencyContacts** — `orgId`, `memberId`, `name`, `relationship?`,
  `phone`, `email?`.
- **teams** — `orgId`, `name`, `ageGroup?`, `season?`, `description?`,
  `isActive`; soccer extras: `kitColour?`, `kitBagNumber?`,
  `competitionId?`, `divisionId?`, `coach?`, `coachEmail?`, `coachPhone?`,
  `additionalCoach?`, `additionalCoachEmail?`, `additionalCoachPhone?`,
  `manager?`, `managerEmail?`, `managerPhone?`, `teamRegistered?`,
  `teamRegisteredDate?`, `teamRegistrationPaid?`.
- **teamMembers** — `orgId`, `teamId`, `memberId`, `role`
  (`player|coach|manager`).
- **events** — `orgId`, `type` (string, validated against `event_type`
  taxonomy), `title`, `description?`, `location?`, `startTime` (epoch
  ms), `endTime?` (epoch ms), `teamId?` (undefined = org-wide),
  `opponent?`, `createdBy`.
- **rsvps** — one per (event, member). `orgId`, `eventId`, `memberId`,
  `status` (`going|not_going|maybe`), `respondedBy`, `respondedAt`.
- **attendance** — `orgId`, `eventId`, `memberId`, `present`,
  `recordedBy`, `recordedAt`.
- **announcements** — `orgId`, `title`, `body` (raw — see § 11),
  `teamId?`, `pinned`, `createdBy`.
- **announcementReads** — `orgId`, `announcementId`, `userId`, `readAt`.
- **assets** — KitTrace. `orgId`, `name`, `category` (validated against
  `asset_category` taxonomy), `description?`, `serialNumber?`,
  `purchaseDate?` (ISO), `replacementValue?` (number, currency-major),
  `condition` (validated against `asset_condition` taxonomy), `status`
  (`available|checked_out|in_use|maintenance|lost|retired`),
  `custodianMemberId?`, `location?`, `notes?`, `sponsorId?`, `qrTagId?`
  (denormalised), `nfcTagId?` (denormalised), `dueBack?` (epoch ms).
- **assetTags** — `tagId` is **globally unique** so a scan resolves
  without org context. `orgId`, `tagId` (e.g. `tag_ab12cd34`), `assetId`,
  `type` (`qr|nfc`), `active`.
- **assetAuditLog** — **append-only**, never updated or deleted. `orgId`,
  `assetId`, `action` (`created|updated|checked_out|checked_in|transferred|reported_lost|maintenance|retired|tag_registered|tag_reassigned`),
  `fromStatus?`, `toStatus?`, `fromCustodianMemberId?`,
  `toCustodianMemberId?`, `fromLocation?`, `toLocation?`, `notes?`,
  `performedBy`, `performedAt`.
- **volunteerCertifications** — `orgId`, `memberId`, `name`, `issuer?`,
  `issuedDate?`, `expiryDate?` (ISO; drives expiry queries), `notes?`.
- **sponsors** — `orgId`, `name`, `contactName?`, `contactEmail?`,
  `contactPhone?`, `website?`, `logoStorageId?` (R2 object key),
  `sponsorshipValue?`,
  `startDate?`, `endDate?`, `visibleOnPublicSite`, `notes?`.
- **news** — `orgId`, `title`, `slug` (unique within org), `body` (raw —
  no markdown processing, see § 11), `excerpt?`, `coverImageStorageId?` (R2
  object key), `published`, `publishedAt?`, `authorUserId`.
- **publicSiteSettings** — one per org. `orgId`, `enabled`, `tagline?`,
  `about?`, `primaryColor?`, `contactEmail?`, `contactPhone?`, `address?`,
  `facebookUrl?`, `instagramUrl?`, `websiteUrl?`.

### Soccer-mode tables (only when `organizations.soccerMode === true`)

- **soccerSkills** — rubric. `orgId`, `name`, `description?`, `maxScore`
  (default 10), `weight` (0..1), `order`, `active`. Lazy-seeded with 7
  defaults.
- **soccerEvaluations** — per (member, skill); upsert. `orgId`,
  `memberId`, `skillId`, `score`, `notes?`, `evaluatedBy`, `evaluatedAt`.
- **soccerDivisions** — grade bands. `orgId`, `name`, `minGrade`,
  `maxGrade`, `color?`, `order`, `active`.
- **soccerCompetitions** — `orgId`, `name`, `season?`, `order`, `active`.
- **soccerRegistrations** — per member. `orgId`, `memberId`,
  `competitionId?`, `ageGroupKey?` (matches `team_age_group` taxonomy),
  `divisionId?`, `teamId?`, `ffaNumber?`, `gender?`, `schoolName?`,
  `registered`, `registeredAt?`, `paid`, `paidAt?`, `paymentPlan?`,
  `paymentPlanStart?` (ISO), `paymentPlanEnd?` (ISO), `comments?`.
- **soccerWwvp** — WWVP background-check status. `orgId`, `memberId`,
  `status` (`not_provided|sighted|pending|approved`), `sightedAt?`,
  `expiresAt?` (both ISO), `notes?`, `registered?`, `registeredDate?`,
  `updatedBy`, `updatedAt`.

## 7. API surface by feature

Every function reachable as `api.<module>.<name>` from the Convex Swift
client. Queries are reactive subscriptions; mutations are one-shot. Mirror
the web's behaviour of **not** rendering optimistic updates that hide a
failed write (`PRODUCT.md` Principle 1: "Server is truth"); surface a
spinner on the affected control instead.

### 7.1 Auth / sync — `web/convex/sync.ts`, `web/convex/clerk.ts`

- **`sync.ensureFromClient`** — mutation. `{}` → `{ userId }`. Idempotent
  upsert of the Convex `users` mirror from JWT claims. Call on launch.
- **`sync.currentContext`** — query. `{}` → `{ user, org, role } | null`.
  Drives `RootView` routing.
- **`sync.myMemberships`** — query. `{}` → `Array<{ membershipId, role, isActive, org }>`.
  Drives `OrgPickerView`.
- **`clerk.upsertUser` / `clerk.deleteUser`** — internal-only (Clerk
  webhook in `web/convex/http.ts`). iOS never calls these.

### 7.2 Organisations — `web/convex/organizations.ts`

- **`organizations.create`** — mutation, `requireUser`. `{ name, slug? }`
  → `{ orgId, slug }`. Caller becomes `owner`, org becomes `activeOrgId`,
  default taxonomies seeded.
- **`organizations.joinByCode`** — mutation, `requireUser`. `{ code }`.
  Caller added as `player`, org set active. **Rate-limited** 5/60s
  (stored in `joinAttempts`); on overflow throws
  `ConvexError("Too many attempts. Wait a minute before trying again.")`
  — string, not coded.
- **`organizations.setActive`** — mutation, `requireUser`. `{ orgId }`.
  Validates membership; patches `activeOrgId`. All live subscriptions
  re-fetch.
- **`organizations.leave`** — mutation, `requireUser`. `{ orgId }`. Last
  owner cannot leave.
- **`organizations.getInviteCode`** — query, `requireRole("admin")`.
- **`organizations.rotateInviteCode`** — mutation, `requireRole("admin")`.
- **`organizations.update`** — mutation, `requireRole("admin")`.
  `{ name?, slug?, imageUrl? }`.

### 7.3 Invitations — `web/convex/invitations.ts`

- **`invitations.send`** — mutation, `requireRole("admin")`.
  `{ email, role }`. Owner-grants require `auth.role === "owner"`. Revokes
  open invites for the same email, then schedules `invitations.deliver`.
- **`invitations.list`** — query, `requireRole("admin")`. Annotated with
  `status` ∈ `pending|accepted|expired|revoked`.
- **`invitations.revoke`** — mutation, `requireRole("admin")`.
- **`invitations.preview`** — query, **unauthenticated**. `{ code }` →
  `{ status: "pending", orgName, email, role }` or `{ status: not_found | revoked | accepted | expired }`.
- **`invitations.accept`** — mutation, `requireUser`. `{ code }`. **Dual
  email check:** both the Convex `users.email` mirror **and** the live
  Clerk JWT `identity.email` must equal `invitations.email`. On mismatch
  throws `ConvexError("This invitation was sent to <email>. Sign in with that email to accept.")`.
  Upgrades existing membership only if invited role ≥ current; never
  silently demotes. Sets `activeOrgId`.
- **`invitations.deliver`** — internalAction. Not callable from iOS.

### 7.4 Members — `web/convex/members.ts`

- **`members.list`** — query, `requireOrgMember`.
  `{ status?, search?, lifetimeOnly? }`. Sorted by last name.
- **`members.get`** — query, `requireOrgMember`. `{ memberId }` → member +
  guardians + dependents + emergencyContacts + team links + certifications.
  `assertSameOrg` collapses absent / cross-org into `not_found`.
- **`members.create`** — mutation, `requireRole("coach")`.
- **`members.update`** — mutation, `requireRole("coach")`. `clubRole`
  nullable.
- **`members.remove`** — mutation, `requireRole("admin")`. Cascades
  `guardians`, `emergencyContacts`, `teamMembers`, `rsvps`, `attendance`,
  `volunteerCertifications`.
- **`members.addGuardian` / `removeGuardian`** — mutations,
  `requireRole("coach")`.
- **`members.addEmergencyContact` / `removeEmergencyContact`** — mutations,
  `requireRole("coach")`.
- **`members.setLifetimeMember`** — mutation, `requireRole("committee")`.

### 7.5 Teams — `web/convex/teams.ts`

- **`teams.list`** — query, `requireOrgMember`. `{ includeInactive? }`.
  Rows include `playerCount`, `staffCount`.
- **`teams.get`** — query, `requireOrgMember`. `{ teamId }` →
  `{ team, players, staff }`.
- **`teams.create`** / **`teams.update`** — mutations,
  `requireRole("committee")`. `competitionId` and `divisionId`
  `assertSameOrg`-checked.
- **`teams.remove`** — mutation, `requireRole("admin")`. Cascades
  `teamMembers`.
- **`teams.assignMember` / `unassignMember`** — mutations,
  `requireRole("coach")`. Upsert on (teamId, memberId).

### 7.6 Events + RSVP + attendance — `web/convex/events.ts`

- **`events.list`** — query, `requireOrgMember`.
  `{ upcomingOnly?, teamId? }`. Rows include `teamName`, `goingCount`.
- **`events.get`** — query, `requireOrgMember`. Returns full rsvp +
  attendance + counts.
- **`events.create`** / **`events.update`** — mutations,
  `requireRole("coach")`. `type` validated against `event_type` taxonomy;
  `teamId` `assertSameOrg`-checked.
- **`events.remove`** — mutation, `requireRole("coach")`. Cascades `rsvps`,
  `attendance`.
- **`events.setRsvp`** — mutation, `requireOrgMember`.
  `{ eventId, memberId, status }`. **Authorisation:** caller must be (a)
  the member (`member.userId === auth.user._id`), (b) a registered
  guardian, or (c) `coach+`. Otherwise
  `ConvexError({ code: "forbidden", message: "You can only RSVP for yourself, your dependants, or as a coach." })`.
- **`events.setAttendance`** — mutation, `requireRole("coach")`.

### 7.7 Announcements — `web/convex/announcements.ts`

- **`announcements.list`** — query, `requireOrgMember`. `{ teamId? }`.
  Pinned first, then newest; rows include `isRead`.
- **`announcements.create`** / **`remove`** — mutations. Org-wide:
  `requireRole("committee")`. Team-scoped: `requireRole("coach")`.
- **`announcements.setPinned`** — mutation, `requireRole("committee")`.
- **`announcements.markRead`** — mutation, `requireOrgMember`. Idempotent.

### 7.8 Volunteers — `web/convex/volunteers.ts`

- **`volunteers.list`** — query, `requireOrgMember`. Members where
  `isVolunteer === true`, with certifications.
- **`volunteers.expiringCertifications`** — query, `requireOrgMember`.
  `{ withinDays? }` (default 60). ISO-string horizon.
- **`volunteers.addCertification` / `removeCertification`** — mutations,
  `requireRole("committee")`. Adding flips `isVolunteer = true`.

### 7.9 Assets + KitTrace — `web/convex/assets.ts`, `web/convex/assetOps.ts`

All mutations and `assetOps.overdue` require `ASSET_MANAGER_ROLES =
["owner", "admin", "committee", "coach", "volunteer"]` (`requireAnyRole`)
unless noted.

- **`assets.list`** — query, `requireOrgMember`.
  `{ status?, category?, search? }`. Rows include `custodianName`.
- **`assets.get`** — query, `requireOrgMember`. → `{ asset, custodian, sponsor, tags }`.
- **`assets.history`** — query, `requireOrgMember`. Per-asset audit log,
  newest first.
- **`assets.allHistory`** — query, `requireOrgMember`. Org-wide audit feed.
- **`assets.create`** — mutation. Validates taxonomies, mints a `qrTagId`,
  writes `created` audit.
- **`assets.update`** — mutation. Audit-logs `updated`.
- **`assets.reassignTag`** — mutation. `{ tagId, toAssetId }`. Cross-org
  tags throw the same opaque `"Tag not found in your organisation."`.
- **`assets.registerNfc`** — mutation. `{ assetId, nfcTagId }`. Globally
  unique; cross-org clash returns the same opaque error as in-org.
- **`assets.remove`** — mutation, `requireRole("admin")`. Retains audit
  rows; deletes `assetTags`.
- **`assetOps.checkOut`** — mutation. `{ assetId, custodianMemberId, location?, dueBack?, notes? }`.
  Rejects retired or already-checked-out.
- **`assetOps.checkIn`** — mutation. `{ assetId, location?, notes? }`.
  Clears custodian and `dueBack`.
- **`assetOps.transfer`** — mutation. Direct custodian → custodian.
- **`assetOps.reportLost`** / **`setMaintenance`** / **`retire`** —
  mutations. `setMaintenance` and `retire` clear custodian.
- **`assetOps.overdue`** — query. Checked-out assets past `dueBack`.

### 7.10 Sponsors — `web/convex/sponsors.ts`

- **`sponsors.list`** / **`get`** — queries, `requireOrgMember`. Resolves
  `logoUrl` through the org-scoped upload helper, which signs or exposes the
  underlying R2 object only after the owner record is authorised.
- **`sponsors.create`** / **`update`** — mutations,
  `requireRole("committee")`.
- **`sponsors.remove`** — mutation, `requireRole("admin")`. Unlinks
  sponsored assets first.
- **`sponsors.totalValue`** — query, `requireOrgMember`.

### 7.11 News — `web/convex/news.ts`

- **`news.list`** / **`get`** — queries, `requireOrgMember`. Includes
  drafts.
- **`news.create`** / **`update`** / **`remove`** — mutations,
  `requireRole("committee")`. `publishedAt` stamped on first publish.

### 7.12 Soccer — `web/convex/soccer.ts`

All mutations call `assertSoccerMode`; on `soccerMode !== true` throw
`ConvexError({ code: "soccer_mode_disabled" })`.

- **`soccer.setSoccerMode`** / **`restoreGradingDefaults`** — mutations,
  `requireRole("admin")`. Lazy-seeds defaults on enable.
- **Skills:** `listSkills` (query); `createSkill`, `updateSkill`
  (mutations, `requireRole("committee")`).
- **Divisions:** `listDivisions` (query); `upsertDivision` (mutation,
  `requireRole("committee")`) — throws `ConvexError({ code: "invalid_band" })`
  if `minGrade > maxGrade`.
- **Competitions:** `listCompetitions` (query); `upsertCompetition`
  (mutation, `requireRole("committee")`).
- **Registrations:** `listRegistrations` (`{ teamId? }`),
  `getRegistration` (`{ memberId }`) — queries; `upsertRegistration`
  (mutation, `requireRole("committee")`). **Every FK** (`competitionId`,
  `divisionId`, `teamId`) is `assertSameOrg`-checked.
- **WWVP:** `listWwvp` (query); `upsertWwvp` (mutation,
  `requireRole("committee")`).
- **Evaluations:** `playerGrade` (`{ memberId }` →
  `{ grade, division, scoredCount, totalSkills, evaluations }`),
  `playerEvaluations` — queries; `upsertEvaluation` (mutation,
  `requireRole("coach")`) — throws `ConvexError({ code: "invalid_score" })`
  out of range.
- **Aggregates (queries, `requireOrgMember`):** `coachesAndManagers`,
  `divisionRoster`, `playerListing`, `playerRoster`, `dashboardStats`
  (returns `null` when `soccerMode` is off).

### 7.13 Taxonomies — `web/convex/taxonomies.ts`

- **`taxonomies.list`** (query, `requireOrgMember`,
  `{ kind, includeInactive? }`) and **`listAllKinds`** (query) — lazy-seed
  on read.
- Mutations (`requireRole("committee")`): `seedDefaultsIfEmpty`, `create`
  (throws `duplicate_key | invalid_label | invalid_key`), `update`,
  `setActive`, `setDefault`, `reorder`.

### 7.14 Public site — `web/convex/publicSite.ts`

- **`publicSite.getSettings`** / **`upsertSettings`** — query / mutation,
  `requireRole("admin")`.
- **`publicSite.publicProfile`** — query, **unauthenticated**. `{ slug }`
  → org + active teams + public sponsors + last 20 published news, or
  `null` if site disabled.
- **`publicSite.publicNewsArticle`** — query, **unauthenticated**.
  `{ slug, articleSlug }` → article or `null`.

### 7.15 Public asset lookup — `web/convex/tags.ts`

- **`tags.lookupPublic`** — query, **unauthenticated**. `{ tagId }` →
  `{ found: false }` or
  `{ found: true, tagId, assetName, category, inService, orgName, message }`.
  Collapses internal status into a binary `inService` flag. Never returns
  custodian, value, serial, or notes.
- **`tags.lookupAuthed`** — query, `requireOrgMember`. Cross-org tags →
  `{ found: false }`.
- **`tags.reassign`** / **`tags.deactivate`** — mutations,
  `requireAnyRole(ASSET_MANAGER_ROLES)`.

### 7.16 Dashboard — `web/convex/dashboard.ts`

- **`dashboard.stats`** — query, `requireOrgMember`. Counts: members,
  teams, upcoming events, assets by status, overdue, volunteers, expiring
  certs (60-day horizon), sponsors, sponsor value.
- **`dashboard.recentAudit`** — query, `requireOrgMember`. Last 50 audit
  rows org-wide.

### 7.17 Roles — `web/convex/roles.ts`

- **`roles.listMembers`** — query, `requireOrgMember`. All memberships +
  user details.
- **`roles.updateRole`** — mutation, `requireRole("admin")`. Owner-grant
  requires owner; only owner can demote another owner; last owner cannot
  be demoted.

### 7.18 Files — `web/convex/files.ts`

- **`files.generateUploadUrl`** — mutation, matching capability per upload
  destination (`sponsors.manage`, `news.manage`, `assets.admin`, or
  `training.manage` for certification documents).
  Short-lived R2 upload URL; client `PUT`s the file.
- **`POST /files/upload-url`** — Convex HTTP endpoint for clients that cannot
  use the Convex SDK. Requires `Authorization: Bearer <Convex JWT>` and the
  same JSON fields as `files.generateUploadUrl`; returns the same upload URL,
  object key, headers, and expiry.
- **`files.completeUpload`** — action. Runs an R2 HEAD check, verifies MIME type
  and byte size, and marks the upload metadata verified. Only verified object
  keys can be attached by the owning mutation. No generic object-key → URL
  resolver — URLs come back through org-scoped queries (e.g. `sponsors.list`,
  `publicSite.*`).

### 7.19 HTTP — `web/convex/http.ts`

- `POST /clerk-webhook` — Svix-verified Clerk webhook. iOS never calls.

## 8. Data flow recipes

### 8.1 First sign-in → user sync → dashboard

1. Launch. Boot Clerk; observe `Clerk.shared.session`.
2. No session → `SignInView` (Clerk iOS SDK flows).
3. Configure `ConvexClient(deploymentUrl:, fetchToken: { try await Clerk.shared.session?.getToken(template: "convex")?.jwt })`.
4. Call mutation `sync.ensureFromClient` (fire-and-forget; idempotent).
   Mirrors the Clerk identity into Convex `users` without depending on
   webhooks. The web does the same on every mount
   (`web/src/lib/gatherhub.tsx`).
5. Subscribe to `sync.currentContext`.
   - `null` while signed in → call `sync.myMemberships`. Empty → render
     Create / Join-by-code (`organizations.create` /
     `organizations.joinByCode`). Single → `organizations.setActive`.
     Multiple → `OrgPickerView`.
   - `{ user, org, role }` → push `HomeView`.
6. On `HomeView`, subscribe to `dashboard.stats` (and
   `soccer.dashboardStats` if `org.soccerMode === true`). Both refresh
   reactively on contributing record changes.

### 8.2 Coach creates an event → guests RSVP

1. Coach calls mutation `events.create` with
   `{ type, title, startTime, endTime?, teamId?, ... }`. Server validates
   `type` against the `event_type` taxonomy and `teamId` org-scope.
2. Every client subscribed to `events.list({ upcomingOnly: true })`
   receives the new event reactively.
3. A parent opens `events.get({ eventId })` and taps RSVP "Going" for
   their child → mutation
   `events.setRsvp({ eventId, memberId: child, status: "going" })`.
4. Server checks: caller is the member, a guardian (resolved via the
   caller's own `members` rows on `by_user`, then matched against
   `guardians.guardianMemberId`), or `coach+`. Otherwise
   `ConvexError({ code: "forbidden", message: "You can only RSVP for yourself, your dependants, or as a coach." })`.
5. Server upserts in `rsvps` on `by_event_and_member`; the coach's
   `events.get` subscription updates immediately.

### 8.3 Committee marks soccer registration paid + records WWVP

1. Subscribe to `soccer.getRegistration({ memberId })` on the member
   detail screen (returns `null` if no row).
2. "Mark paid" → mutation
   `soccer.upsertRegistration({ memberId, paid: true })`. Server gates on
   `requireRole("committee")` and `assertSoccerMode`; sets `paid: true`
   and stamps `paidAt = Date.now()` on first transition. Any FK in args
   is `assertSameOrg`-checked.
3. WWVP → mutation
   `soccer.upsertWwvp({ memberId, status: "sighted", sightedAt: "2026-05-30", expiresAt: "2029-05-30" })`.
   Same gating; `updatedBy` and `updatedAt` server-set.
4. `soccer.dashboardStats` re-fires; counts recompute.

## 9. Public + unauthenticated surfaces

Renderable without an authenticated Convex session. Also universal-link
targets — wire `gatherhub://` in `CFBundleURLTypes` and add
`app.gatherhub.au` to Associated Domains.

| Surface | URL pattern | Convex call | Renderable fields |
| --- | --- | --- | --- |
| Public QR/NFC landing | `https://app.gatherhub.au/a/:tagId` or `gatherhub://asset/:tagId` | `tags.lookupPublic({ tagId })` | `assetName`, `category`, `inService` (binary), `orgName`, the canned return-instructions `message`. Nothing else. |
| Public club site | `https://app.gatherhub.au/club/:slug` | `publicSite.publicProfile({ slug })` | `org.name`, `org.imageUrl`, `settings` (tagline, about, primaryColor, contactEmail, contactPhone, address, social URLs), active teams (name, ageGroup, season, description), public sponsors (name, website, logoUrl), last 20 published news (title, slug, excerpt, publishedAt, coverImageUrl). |
| Public news article | `https://app.gatherhub.au/club/:slug/news/:slug` | `publicSite.publicNewsArticle({ slug, articleSlug })` | `title`, `body` (raw — see § 11), `publishedAt`, `coverImageUrl`, `orgName`. |
| Invitation preview | `https://app.gatherhub.au/invite/:code` | `invitations.preview({ code })` | `status`, then for `pending`: `orgName`, `email`, `role`. |

On universal-link activation, push the unauthenticated screen first; after
sign-in, upgrade to the authenticated equivalent (e.g. `tags.lookupAuthed`
for full asset detail once org + asset-view role are confirmed).

## 10. Error rendering catalogue

The iOS error layer should `try` every Convex call and dispatch on the
typed `code` from `ConvexError.data` (see `web/src/lib/errors.ts` for the
web reference, `parseAuthError`). Sketch: `enum GHError { case auth(AuthErrorCode,String), soccerDisabled(String), rateLimited(String), invitationProblem(String), generic(String) }` — parse `.data.code` first, fall through to message-only.

| Source | Signal | iOS affordance |
| --- | --- | --- |
| `requireUser` / `requireOrgMember` | `unauthenticated` | Silent token refresh; fall to `SignInView`. |
| `requireOrgMember` | `no_active_org` | Push `OrgPickerView`. |
| `requireOrgMember` | `not_member` | `OrgPickerView` + banner; clear `activeOrgId`. |
| `requireRole` / `requireAnyRole` | `forbidden` | Inline access-denied, body = error message. |
| `assertSameOrg`, any get-by-id | `not_found` | "Not found" empty state. Don't distinguish absent vs cross-org. |
| `soccer.*` mutations | `soccer_mode_disabled` | Toast / inline notice. Admin+: "Enable soccer mode in Settings". |
| `organizations.joinByCode` rate limit | `ConvexError("Too many attempts. Wait a minute before trying again.")` (string) | Inline form error; disable submit with a 60s cooldown timer. |
| `organizations.joinByCode` bad code | `ConvexError("Invalid invite code.")` | Inline form error. |
| `invitations.accept` | `Invitation not found.` / `already used.` / `expired.` / email-mismatch | Full-screen "Invitation problem" sheet. Offer "Sign in with a different account" for email mismatch. |
| `invitations.preview` | returned `status: not_found|revoked|accepted|expired` | Status-specific message; no destructive UI. |
| `events.setRsvp` | `code: "forbidden"` | Inline error on the RSVP control; surface the message verbatim. |
| `soccer.upsertEvaluation` | `code: "invalid_score"` | Inline validation under the score field. |
| `soccer.upsertDivision` | `code: "invalid_band"` | Inline validation under the band fields. |
| `taxonomies.*` | `duplicate_key` / `invalid_label` / `invalid_key` / `invalid_taxonomy_key` | Inline form error. |
| `assets.reassignTag`, `registerNfc`, `tags.reassign`, `tags.deactivate` | `"Tag not found in your organisation."` / `"That NFC tag is not available."` | Toast under the scan control. Do **not** disambiguate cross-org vs in-org. |
| `assetOps.checkOut` etc. | `"Asset is already checked out."` / `"This asset is retired and cannot be operated on."` | Inline error on the action sheet. |
| `roles.updateRole` | `"Cannot demote the last owner."` etc. | Inline error in the role picker. |

## 11. Open questions and intentional gaps for iOS v1

Defer these — match (do not exceed) the web behaviour.

- **Rich text / markdown.** `news.body` and `announcements.body` are raw
  strings; the web renders plain text, no markdown processor, no HTML
  sanitiser. iOS should render plain text (URL auto-detect via
  `AttributedString` is fine). Do **not** introduce markdown on iOS while
  the web is plain — client drift is worse than visual flatness.
- **Public news HTML sanitisation.** Same as above; plain-text rendering
  side-steps it.
- **Large-table virtualisation.** `members.list`, `assets.list`, etc.
  return the full org list and paginate client-side. Use `LazyVStack` /
  `List` with stable ids. Server pagination is on the backlog.
- **Offline writes.** Online-first; do **not** silently queue writes —
  ambiguous asset state is unacceptable (see
  `docs/mobile-architecture.md` § 10). Show a banner; block destructive
  mutations until recovery.
- **File-upload validation.** Uploads use server-issued R2 object keys under an
  org-scoped path. Validate locally before upload, call `files.completeUpload`
  after the PUT succeeds, and rely on the owning mutation to re-check verified
  content type, size, owner, and purpose before the object key is attached
  (image/png, image/jpeg, image/webp <= 5MB for logos/photos; PDF <= 15MB for
  certificates).

Security-review items (all server-enforced; iOS must not try to bypass):

- **Client-side role gating is non-authoritative** — server re-checks
  every mutation. Hide controls a role lacks, but do not treat the UI as
  truth.
- **Rate-limit absence on most public surfaces** — only
  `organizations.joinByCode` is capped today; `tags.lookupPublic`,
  `invitations.preview`, `publicSite.*` are uncapped. Errors there will
  not look like 429s.
- **Audit log is immutable for everyone, including Owner.** Render
  read-only.
- **Tag ids are opaque and globally unique.** Do not parse or display the
  raw `tag_…` string beyond the canonical
  `gatherhub://asset/:tagId` link.

## 12. References

- `PRODUCT.md` — positioning, users, voice, anti-references.
- `DESIGN.md` — tokens, typography, motion, primitives, Do's and Don'ts.
- `docs/architecture.md` — system overview, JWT flow, deployment.
- `docs/mobile-architecture.md` — iOS app structure, scan + asset flows,
  screen list.
- `docs/security-model.md` — `requireOrgMember`, permissions matrix,
  public QR rules, file-upload validation, data minimisation.
- `docs/data-model.md` — earlier data-model commentary; defer to
  `web/convex/schema.ts` on conflicts.
- `docs/kittrace.md` — asset lifecycle state machine.
- `web/convex/lib/auth.ts` — auth guards, typed error codes.
- `web/convex/schema.ts` — authoritative schema.
- `web/src/lib/gatherhub.tsx`, `web/src/lib/errors.ts` — web reference
  for the context provider and `ConvexError` parsing.
