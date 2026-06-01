import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * GatherHub data model.
 *
 * Every tenant-scoped table carries an `orgId` (the Convex `_id` of the owning
 * organisation). Organisations live entirely in Convex — Clerk is used only
 * for user identity. The active org is selected per-user (`users.activeOrgId`)
 * and validated against a Convex `memberships` row on every authed request.
 * See `convex/lib/auth.ts` and `/docs/security-model.md`.
 */

// --- Shared enums --------------------------------------------------------

export const roleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("committee"),
  v.literal("coach"),
  v.literal("volunteer"),
  v.literal("parent"),
  v.literal("player"),
);

export const memberStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
);

export const teamRoleValidator = v.union(
  v.literal("player"),
  v.literal("coach"),
  v.literal("manager"),
);

export const eventTypeValidator = v.union(
  v.literal("training"),
  v.literal("match"),
  v.literal("meeting"),
);

export const rsvpStatusValidator = v.union(
  v.literal("going"),
  v.literal("not_going"),
  v.literal("maybe"),
);

export const assetCategoryValidator = v.union(
  v.literal("apparel"),
  v.literal("equipment"),
  v.literal("tool"),
  v.literal("electronics"),
  v.literal("av_equipment"),
  v.literal("safety_equipment"),
  v.literal("furniture"),
  v.literal("vehicle"),
  v.literal("key"),
  v.literal("media"),
  v.literal("other"),
);

export const assetStatusValidator = v.union(
  v.literal("available"),
  v.literal("checked_out"),
  v.literal("in_use"),
  v.literal("maintenance"),
  v.literal("lost"),
  v.literal("retired"),
);

export const assetConditionValidator = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("poor"),
  v.literal("damaged"),
);

export const assetActionValidator = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("checked_out"),
  v.literal("checked_in"),
  v.literal("transferred"),
  v.literal("reported_lost"),
  v.literal("maintenance"),
  v.literal("retired"),
  v.literal("tag_registered"),
  v.literal("tag_reassigned"),
  // A field "sighting" — someone scanned the tag without changing
  // custodian or status. Used by the mobile scan flow to log
  // "the U13 jersey was seen at training on Tuesday".
  v.literal("scanned"),
);

export const tagTypeValidator = v.union(v.literal("qr"), v.literal("nfc"));

export const taskStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

export const taskReminderEmailStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped"),
);

/**
 * Taxonomy kinds: lists of values that orgs configure themselves rather than
 * us hardcoding. The corresponding fields on `events` / `assets` / `teams`
 * store free strings; mutations validate against the active taxonomy rows.
 */
export const taxonomyKindValidator = v.union(
  v.literal("event_type"),
  v.literal("asset_category"),
  v.literal("asset_condition"),
  v.literal("team_age_group"),
);

// --- Schema --------------------------------------------------------------

export default defineSchema({
  // Per-org configurable taxonomies. Replaces hardcoded enums for event
  // types, asset categories, asset conditions, and team age groups. The
  // referenced records (events.type, assets.category, etc.) store the
  // `key` string. Soft-delete via `active=false` keeps existing records
  // readable but hides the option from create dropdowns.
  taxonomies: defineTable({
    orgId: v.id("organizations"),
    kind: taxonomyKindValidator,
    key: v.string(), // slug; immutable once referenced
    label: v.string(), // display, editable
    order: v.number(), // sort within kind
    active: v.boolean(),
    isDefault: v.optional(v.boolean()), // one per kind, used in create-record default
    color: v.optional(v.string()), // optional accent tint for chips
  })
    .index("by_org_kind_order", ["orgId", "kind", "order"])
    .index("by_org_kind_key", ["orgId", "kind", "key"])
    .index("by_org_kind_active", ["orgId", "kind", "active"]),

  // Identity mirror. `clerkUserId` is the Clerk subject — used only to bind a
  // signed-in session to the Convex user. `activeOrgId` is the org the user is
  // currently working in; switched in-app via `organizations.setActive`.
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    activeOrgId: v.optional(v.id("organizations")),
  }).index("by_clerk_id", ["clerkUserId"]),

  // Clubs. Created and owned entirely in Convex. `inviteCode` is an opaque
  // short string used by `organizations.joinByCode`; null/absent disables it.
  // `soccerMode` unlocks soccer-specific surfaces (Registrations, Grading,
  // soccer settings, kit metadata on teams).
  organizations: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdBy: v.id("users"),
    inviteCode: v.optional(v.string()),
    soccerMode: v.optional(v.boolean()),
    defaultAddress: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_invite_code", ["inviteCode"]),

  // User ↔ organisation link with role. Convex-native; not synced from Clerk.
  memberships: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    role: roleValidator,
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["orgId", "userId"])
    .index("by_user_and_org", ["userId", "orgId"]),

  // Email-based org invitations. Committee sends to an email + role; recipient
  // clicks the emailed link, signs in/up via Clerk, and accepts. Codes are
  // opaque, single-use, and expire.
  invitations: defineTable({
    orgId: v.id("organizations"),
    email: v.string(), // lowercased
    role: roleValidator,
    code: v.string(),
    invitedByUserId: v.id("users"),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_org", ["orgId"])
    .index("by_org_and_email", ["orgId", "email"]),

  // Per-user attempt log for org join-by-invite-code, used to rate-limit
  // brute-force grinding of the 10-char invite code. Append-only.
  joinAttempts: defineTable({
    userId: v.id("users"),
    attemptedAt: v.number(),
    success: v.boolean(),
  }).index("by_user_and_time", ["userId", "attemptedAt"]),

  // Durable idempotency ledger for native offline sync queue submissions.
  // A mobile client sends one stable clientMutationId per queued operation; if
  // the network drops after Convex commits, a retry returns without repeating
  // side effects such as audit-log inserts or asset creation.
  clientMutations: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    clientMutationId: v.string(),
    operation: v.string(),
    resultId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_org_user_client", ["orgId", "userId", "clientMutationId"])
    .index("by_org", ["orgId"]),

  // People in a club. A member may or may not be a Clerk user (e.g. a child).
  members: defineTable({
    orgId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()), // ISO yyyy-mm-dd
    status: memberStatusValidator,
    notes: v.optional(v.string()),
    // Volunteer fields (Epic 9)
    isVolunteer: v.boolean(),
    volunteerSkills: v.optional(v.array(v.string())),
    volunteerAvailability: v.optional(v.string()),
    volunteerNotes: v.optional(v.string()),
    // Lifetime member recognition. Universal (any club kind can mark a
    // person as a lifetime member; soccer clubs migrated this in from a
    // dedicated table).
    isLifetimeMember: v.optional(v.boolean()),
    lifetimeMemberSince: v.optional(v.string()), // year or ISO date
    lifetimeMemberNotes: v.optional(v.string()),
    // Belwest lifetimeMembers parity: separate "first added to club"
    // date from joinYear, plus the person who added the record.
    lifetimeMemberFirstAddedToClub: v.optional(v.string()),
    lifetimeMemberAddedBy: v.optional(v.string()),
    // Functional role in the club (separate from app-auth role). Free
    // string so each org can extend it. Common values: "coach",
    // "manager", "player", "parent", "committee", "volunteer".
    clubRole: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_status", ["orgId", "status"])
    .index("by_org_and_volunteer", ["orgId", "isVolunteer"])
    .index("by_user", ["userId"]),

  // Parent / guardian relationships between members.
  guardians: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("members"), // the child / dependent
    guardianMemberId: v.id("members"), // the parent / guardian
    relationship: v.optional(v.string()), // e.g. "Mother", "Guardian"
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"])
    .index("by_guardian", ["guardianMemberId"]),

  emergencyContacts: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("members"),
    name: v.string(),
    relationship: v.optional(v.string()),
    phone: v.string(),
    email: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"]),

  // Restricted-visibility medical notes (separate table so reads can be gated).
  medicalNotes: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("members"),
    notes: v.string(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"]),

  teams: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    ageGroup: v.optional(v.string()),
    season: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    // Soccer mode extras. Free-string hex like "#bf0000" for visual
    // identity; bag number identifies the physical kit bag (KitTrace-ish).
    kitColour: v.optional(v.string()),
    kitBagNumber: v.optional(v.string()),
    // Belwest parity: per-team competition + division links, contact
    // details for coach / additional coach / manager, and the team's
    // own registration / payment state with the federation.
    competitionId: v.optional(v.id("soccerCompetitions")),
    divisionId: v.optional(v.id("soccerDivisions")),
    coach: v.optional(v.string()),
    coachEmail: v.optional(v.string()),
    coachPhone: v.optional(v.string()),
    additionalCoach: v.optional(v.string()),
    additionalCoachEmail: v.optional(v.string()),
    additionalCoachPhone: v.optional(v.string()),
    manager: v.optional(v.string()),
    managerEmail: v.optional(v.string()),
    managerPhone: v.optional(v.string()),
    teamRegistered: v.optional(v.boolean()),
    teamRegisteredDate: v.optional(v.string()),
    teamRegistrationPaid: v.optional(v.boolean()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_active", ["orgId", "isActive"]),

  teamMembers: defineTable({
    orgId: v.id("organizations"),
    teamId: v.id("teams"),
    memberId: v.id("members"),
    role: teamRoleValidator,
  })
    .index("by_org", ["orgId"])
    .index("by_team", ["teamId"])
    .index("by_member", ["memberId"])
    .index("by_team_and_member", ["teamId", "memberId"]),

  events: defineTable({
    orgId: v.id("organizations"),
    type: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.number(), // epoch ms
    endTime: v.optional(v.number()),
    teamId: v.optional(v.id("teams")), // undefined == org-wide
    opponent: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_start", ["orgId", "startTime"])
    .index("by_team", ["teamId"]),

  rsvps: defineTable({
    orgId: v.id("organizations"),
    eventId: v.id("events"),
    memberId: v.id("members"),
    status: rsvpStatusValidator,
    respondedBy: v.id("users"),
    respondedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_event", ["eventId"])
    .index("by_event_and_member", ["eventId", "memberId"])
    .index("by_member", ["memberId"]),

  attendance: defineTable({
    orgId: v.id("organizations"),
    eventId: v.id("events"),
    memberId: v.id("members"),
    present: v.boolean(),
    recordedBy: v.id("users"),
    recordedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_event", ["eventId"])
    .index("by_event_and_member", ["eventId", "memberId"])
    .index("by_member", ["memberId"]),

  announcements: defineTable({
    orgId: v.id("organizations"),
    title: v.string(),
    body: v.string(),
    teamId: v.optional(v.id("teams")), // undefined == org-wide
    pinned: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_pinned", ["orgId", "pinned"])
    .index("by_team", ["teamId"]),

  announcementReads: defineTable({
    orgId: v.id("organizations"),
    announcementId: v.id("announcements"),
    userId: v.id("users"),
    readAt: v.number(),
  })
    .index("by_announcement_and_user", ["announcementId", "userId"])
    .index("by_user", ["userId"]),

  // KitTrace assets (Epic 6).
  assets: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()), // ISO yyyy-mm-dd
    replacementValue: v.optional(v.number()), // minor units? stored as number (currency major)
    condition: v.string(),
    status: assetStatusValidator,
    custodianMemberId: v.optional(v.id("members")),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    sponsorId: v.optional(v.id("sponsors")),
    // Convenience denormalised tag fields; canonical mapping is in assetTags.
    qrTagId: v.optional(v.string()),
    nfcTagId: v.optional(v.string()),
    // For overdue tracking on check-out.
    dueBack: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_status", ["orgId", "status"])
    .index("by_org_and_category", ["orgId", "category"])
    .index("by_custodian", ["custodianMemberId"])
    .index("by_sponsor", ["sponsorId"]),

  // Opaque tag → asset mapping for QR / NFC lookups (public-safe).
  assetTags: defineTable({
    orgId: v.id("organizations"),
    tagId: v.string(), // opaque, e.g. "tag_ab12cd34"
    assetId: v.id("assets"),
    type: tagTypeValidator,
    active: v.boolean(),
  })
    .index("by_tag", ["tagId"])
    .index("by_asset", ["assetId"])
    .index("by_org", ["orgId"]),

  // Immutable, append-only audit log for asset operations (Epic 7).
  assetAuditLog: defineTable({
    orgId: v.id("organizations"),
    assetId: v.id("assets"),
    action: assetActionValidator,
    fromStatus: v.optional(assetStatusValidator),
    toStatus: v.optional(assetStatusValidator),
    fromCustodianMemberId: v.optional(v.id("members")),
    toCustodianMemberId: v.optional(v.id("members")),
    fromLocation: v.optional(v.string()),
    toLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Optional geo capture written by the mobile scan flow.
    geoLatitude: v.optional(v.number()),
    geoLongitude: v.optional(v.number()),
    geoAccuracy: v.optional(v.number()),
    performedBy: v.id("users"),
    performedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_asset", ["assetId"])
    .index("by_org_and_action", ["orgId", "action"]),

  // Historically named from the original volunteer module. This is now the
  // generic training/certification record table for any member in any org.
  volunteerCertifications: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("members"),
    name: v.string(),
    issuer: v.optional(v.string()),
    issuedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()), // ISO yyyy-mm-dd
    notes: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"])
    .index("by_org_and_expiry", ["orgId", "expiryDate"]),

  tasks: defineTable({
    orgId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeMemberId: v.optional(v.id("members")),
    status: taskStatusValidator,
    dueDate: v.optional(v.string()), // ISO yyyy-mm-dd
    order: v.number(),
    reminderEnabled: v.boolean(),
    reminderEveryDays: v.number(),
    lastReminderQueuedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status_order", ["orgId", "status", "order"])
    .index("by_org_assignee", ["orgId", "assigneeMemberId"])
    .index("by_org_due", ["orgId", "dueDate"])
    .index("by_due", ["dueDate"]),

  taskReminderEmails: defineTable({
    orgId: v.id("organizations"),
    taskId: v.id("tasks"),
    assigneeMemberId: v.optional(v.id("members")),
    email: v.optional(v.string()),
    status: taskReminderEmailStatusValidator,
    subject: v.string(),
    body: v.string(),
    dueDate: v.string(),
    queuedAt: v.number(),
    sentAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_task", ["taskId"])
    .index("by_status_queued", ["status", "queuedAt"]),

  sponsors: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    website: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    sponsorshipValue: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    visibleOnPublicSite: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_public", ["orgId", "visibleOnPublicSite"]),

  news: defineTable({
    orgId: v.id("organizations"),
    title: v.string(),
    slug: v.string(),
    body: v.string(),
    excerpt: v.optional(v.string()),
    coverImageStorageId: v.optional(v.id("_storage")),
    published: v.boolean(),
    publishedAt: v.optional(v.number()),
    authorUserId: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_published", ["orgId", "published"])
    .index("by_org_and_slug", ["orgId", "slug"]),

  uploadedFiles: defineTable({
    orgId: v.id("organizations"),
    storageId: v.id("_storage"),
    path: v.string(),
    ownerType: v.string(),
    ownerId: v.string(),
    purpose: v.string(),
    fileName: v.optional(v.string()),
    contentType: v.string(),
    size: v.number(),
    uploadedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_storage", ["storageId"])
    .index("by_org_path", ["orgId", "path"])
    .index("by_org_owner", ["orgId", "ownerType", "ownerId"]),

  publicSiteSettings: defineTable({
    orgId: v.id("organizations"),
    enabled: v.boolean(),
    tagline: v.optional(v.string()),
    about: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    address: v.optional(v.string()),
    facebookUrl: v.optional(v.string()),
    instagramUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
  }).index("by_org", ["orgId"]),

  // ---------- Soccer-mode tables --------------------------------------
  // Only used when `organizations.soccerMode === true`. Designed as
  // sidecars over members so non-soccer orgs aren't affected.

  // Skill rubric. Configurable per org. Lazy-seeded with seven defaults
  // (Ball Handling, Passing, Shooting, Defense, Speed & Agility,
  // Physical Strength, Game Intelligence) on first read.
  soccerSkills: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    maxScore: v.number(), // typically 10
    weight: v.number(), // 0..1
    order: v.number(),
    active: v.boolean(),
  })
    .index("by_org_order", ["orgId", "order"])
    .index("by_org_active", ["orgId", "active"]),

  // One row per (member, skill). Latest score wins (upsert on write).
  soccerEvaluations: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("members"),
    skillId: v.id("soccerSkills"),
    score: v.number(),
    notes: v.optional(v.string()),
    evaluatedBy: v.id("users"),
    evaluatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"])
    .index("by_member_skill", ["memberId", "skillId"]),

  // Grade-band divisions. Used to auto-assign a player to a division
  // from their computed overall grade.
  soccerDivisions: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    minGrade: v.number(), // 0..100 inclusive
    maxGrade: v.number(),
    color: v.optional(v.string()), // hex
    order: v.number(),
    active: v.boolean(),
  })
    .index("by_org_order", ["orgId", "order"])
    .index("by_org_active", ["orgId", "active"]),

  soccerCompetitions: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    season: v.optional(v.string()),
    order: v.number(),
    active: v.boolean(),
  }).index("by_org_order", ["orgId", "order"]),

  // Per-member registration record. Covers rego status, payment status,
  // payment plan window, FFA number, gender, school.
  soccerRegistrations: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("members"),
    competitionId: v.optional(v.id("soccerCompetitions")),
    ageGroupKey: v.optional(v.string()), // matches team_age_group taxonomy
    divisionId: v.optional(v.id("soccerDivisions")),
    teamId: v.optional(v.id("teams")),
    ffaNumber: v.optional(v.string()),
    gender: v.optional(v.string()), // "male" | "female" | "unspecified"
    schoolName: v.optional(v.string()),
    registered: v.boolean(),
    registeredAt: v.optional(v.number()),
    paid: v.boolean(),
    paidAt: v.optional(v.number()),
    paymentPlan: v.optional(v.boolean()),
    paymentPlanStart: v.optional(v.string()), // ISO yyyy-mm-dd
    paymentPlanEnd: v.optional(v.string()),
    comments: v.optional(v.string()),
    // Per-player kit colour override. Optional — when unset, the
    // player inherits the kit colour from `teams.kitColour` of their
    // assigned team. Free string so committee can store a hex, a name
    // ("home"), or anything the club recognises.
    kitColour: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_member", ["orgId", "memberId"])
    .index("by_org_team", ["orgId", "teamId"])
    .index("by_org_division", ["orgId", "divisionId"]),

  // Working with Vulnerable People (or equivalent) background-check
  // status. Required by clubs for coaches and managers.
  soccerWwvp: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("members"),
    status: v.string(), // "not_provided" | "sighted" | "pending" | "approved"
    sightedAt: v.optional(v.string()), // ISO yyyy-mm-dd
    expiresAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Belwest parity: coach/manager's own federation registration status
    // tracked alongside WWVP.
    registered: v.optional(v.boolean()),
    registeredDate: v.optional(v.string()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"]),

  // Per-org QR code render settings. One row per organisation.
  // Drives the customisable QR codes printed for KitTrace assets
  // (style ported from new-indigi-link).
  qrSettings: defineTable({
    orgId: v.id("organizations"),
    // Foreground / background colours. Hex with leading "#".
    fgColor: v.string(),
    bgColor: v.string(),
    // Data-module style.
    dotStyle: v.string(), // square | rounded | dots | classy | classy-rounded
    // Finder-pattern style.
    cornerSquareStyle: v.string(), // square | rounded | dots
    // Quiet zone in modules.
    margin: v.number(),
    // Logo overlay size.
    logoSize: v.string(), // small | medium | large
    // Optional uploaded logo storage id.
    logoStorageId: v.optional(v.id("_storage")),
    // Optional rectangular border outside the QR.
    borderEnabled: v.boolean(),
    borderColor: v.string(),
    borderWidth: v.number(),
    borderRadius: v.number(),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
  }).index("by_org", ["orgId"]),
});
