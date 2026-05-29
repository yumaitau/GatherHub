import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { generateTagId, generateSlug } from "./lib/ids";

/**
 * Seed a self-contained demo club ("Demo United FC") with members, teams,
 * events, assets, sponsors and news. Idempotent: if the demo org already
 * exists it is left untouched.
 *
 * Run with: `npx convex run seed:run`  (or `npm run seed`).
 *
 * To explore the app against this data, create a Clerk organisation whose id is
 * mirrored here, OR call `seed:attachClerkOrg` after signing in to repoint the
 * demo data at your real Clerk org. For the public site, visit /club/demo-united.
 */

const DEMO_CLERK_ORG = "org_demo_united";
const DEMO_SLUG = "demo-united";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_id", (q) => q.eq("clerkOrgId", DEMO_CLERK_ORG))
      .unique();
    if (existing) {
      return { status: "already-seeded", orgId: existing._id };
    }

    const now = Date.now();
    const day = 86_400_000;

    const orgId = await ctx.db.insert("organizations", {
      clerkOrgId: DEMO_CLERK_ORG,
      name: "Demo United FC",
      slug: DEMO_SLUG,
    });

    // Demo users (committee + coach).
    const adminUserId = await ctx.db.insert("users", {
      clerkUserId: "user_demo_admin",
      email: "admin@demo-united.example",
      firstName: "Alex",
      lastName: "Committee",
    });
    const coachUserId = await ctx.db.insert("users", {
      clerkUserId: "user_demo_coach",
      email: "coach@demo-united.example",
      firstName: "Sam",
      lastName: "Coach",
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: adminUserId,
      clerkUserId: "user_demo_admin",
      role: "owner",
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: coachUserId,
      clerkUserId: "user_demo_coach",
      role: "coach",
    });

    // Members.
    const memberDefs = [
      ["Jordan", "Smith", true],
      ["Taylor", "Brown", true],
      ["Riley", "Jones", false],
      ["Casey", "Williams", false],
      ["Morgan", "Davies", true],
      ["Jamie", "Evans", false],
      ["Drew", "Thomas", false],
      ["Quinn", "Roberts", false],
      ["Avery", "Walker", false],
      ["Reese", "Wright", false],
      ["Parent", "Garcia", true],
      ["Pat", "Wilson", true],
    ] as const;

    const memberIds: Id<"members">[] = [];
    for (const [firstName, lastName, isVolunteer] of memberDefs) {
      const id = await ctx.db.insert("members", {
        orgId,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@demo-united.example`,
        status: "active",
        isVolunteer,
        volunteerSkills: isVolunteer ? ["First Aid", "Coaching"] : undefined,
      });
      memberIds.push(id);
    }

    // Guardian + emergency contact + medical note examples.
    await ctx.db.insert("guardians", {
      orgId,
      memberId: memberIds[2]!, // Riley (child)
      guardianMemberId: memberIds[10]!, // Parent Garcia
      relationship: "Parent",
    });
    await ctx.db.insert("emergencyContacts", {
      orgId,
      memberId: memberIds[2]!,
      name: "Parent Garcia",
      relationship: "Parent",
      phone: "+61 400 000 000",
    });
    await ctx.db.insert("medicalNotes", {
      orgId,
      memberId: memberIds[2]!,
      notes: "Mild asthma — carries a blue inhaler.",
      updatedBy: adminUserId,
      updatedAt: now,
    });

    // Teams.
    const seniorTeam = await ctx.db.insert("teams", {
      orgId,
      name: "Senior Men's First XI",
      ageGroup: "Senior",
      season: "2026",
      isActive: true,
    });
    const juniorTeam = await ctx.db.insert("teams", {
      orgId,
      name: "Under 12s",
      ageGroup: "U12",
      season: "2026",
      isActive: true,
    });

    // Assign first 5 members to senior team, next 4 to juniors; coach as staff.
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("teamMembers", {
        orgId,
        teamId: seniorTeam,
        memberId: memberIds[i]!,
        role: "player",
      });
    }
    for (let i = 5; i < 9; i++) {
      await ctx.db.insert("teamMembers", {
        orgId,
        teamId: juniorTeam,
        memberId: memberIds[i]!,
        role: "player",
      });
    }
    await ctx.db.insert("teamMembers", {
      orgId,
      teamId: seniorTeam,
      memberId: memberIds[11]!, // Pat Wilson as coach
      role: "coach",
    });

    // Events.
    const training = await ctx.db.insert("events", {
      orgId,
      type: "training",
      title: "Tuesday Training",
      location: "Main Pitch",
      startTime: now + 2 * day,
      endTime: now + 2 * day + 2 * 3_600_000,
      teamId: seniorTeam,
      createdBy: coachUserId,
    });
    await ctx.db.insert("events", {
      orgId,
      type: "match",
      title: "vs Rovers FC",
      location: "Home Ground",
      startTime: now + 5 * day,
      teamId: seniorTeam,
      opponent: "Rovers FC",
      createdBy: coachUserId,
    });
    await ctx.db.insert("events", {
      orgId,
      type: "meeting",
      title: "Committee Meeting",
      location: "Clubhouse",
      startTime: now + 7 * day,
      createdBy: adminUserId,
    });

    // Some RSVPs for the training event.
    for (let i = 0; i < 4; i++) {
      await ctx.db.insert("rsvps", {
        orgId,
        eventId: training,
        memberId: memberIds[i]!,
        status: i % 3 === 0 ? "maybe" : "going",
        respondedBy: coachUserId,
        respondedAt: now,
      });
    }

    // Sponsors.
    const sponsorId = await ctx.db.insert("sponsors", {
      orgId,
      name: "Corner Cafe",
      contactName: "Jo Barista",
      contactEmail: "jo@cornercafe.example",
      website: "https://cornercafe.example",
      sponsorshipValue: 2500,
      startDate: new Date(now - 30 * day).toISOString().slice(0, 10),
      endDate: new Date(now + 335 * day).toISOString().slice(0, 10),
      visibleOnPublicSite: true,
    });
    await ctx.db.insert("sponsors", {
      orgId,
      name: "Town Hardware",
      sponsorshipValue: 1000,
      visibleOnPublicSite: true,
    });

    // Assets (with QR tags) across categories.
    const assetDefs: Array<{
      name: string;
      category:
        | "uniform"
        | "kit_bag"
        | "ball"
        | "training_equipment"
        | "goal"
        | "gazebo"
        | "first_aid"
        | "key"
        | "device"
        | "vehicle"
        | "other";
      status:
        | "available"
        | "checked_out"
        | "in_use"
        | "maintenance"
        | "lost"
        | "retired";
      value?: number;
      custodianIdx?: number;
      sponsored?: boolean;
    }> = [
      {
        name: "Senior Home Kit Set",
        category: "uniform",
        status: "available",
        value: 800,
        sponsored: true,
      },
      {
        name: "Match Ball Bag",
        category: "kit_bag",
        status: "checked_out",
        value: 120,
        custodianIdx: 0,
      },
      {
        name: "Training Cones (x20)",
        category: "training_equipment",
        status: "available",
        value: 60,
      },
      {
        name: "Portable Goal",
        category: "goal",
        status: "maintenance",
        value: 450,
      },
      {
        name: "Club Gazebo 3x3",
        category: "gazebo",
        status: "available",
        value: 300,
      },
      {
        name: "First Aid Kit",
        category: "first_aid",
        status: "in_use",
        value: 80,
        custodianIdx: 11,
      },
      {
        name: "Clubhouse Key",
        category: "key",
        status: "checked_out",
        value: 0,
        custodianIdx: 1,
      },
      {
        name: "Match Recording Tablet",
        category: "device",
        status: "available",
        value: 500,
      },
    ];

    for (const def of assetDefs) {
      const qrTagId = generateTagId();
      const assetId = await ctx.db.insert("assets", {
        orgId,
        name: def.name,
        category: def.category,
        status: def.status,
        condition: "good",
        replacementValue: def.value,
        custodianMemberId:
          def.custodianIdx !== undefined
            ? memberIds[def.custodianIdx]
            : undefined,
        sponsorId: def.sponsored ? sponsorId : undefined,
        qrTagId,
        dueBack: def.status === "checked_out" ? now - 2 * day : undefined, // some overdue
      });
      await ctx.db.insert("assetTags", {
        orgId,
        tagId: qrTagId,
        assetId,
        type: "qr",
        active: true,
      });
      await ctx.db.insert("assetAuditLog", {
        orgId,
        assetId,
        action: "created",
        toStatus: def.status,
        performedBy: adminUserId,
        performedAt: now,
      });
    }

    // Volunteer certifications (one expiring soon).
    await ctx.db.insert("volunteerCertifications", {
      orgId,
      memberId: memberIds[0]!,
      name: "First Aid Certificate",
      issuer: "St John",
      expiryDate: new Date(now + 20 * day).toISOString().slice(0, 10),
    });
    await ctx.db.insert("volunteerCertifications", {
      orgId,
      memberId: memberIds[11]!,
      name: "Working With Children Check",
      expiryDate: new Date(now + 400 * day).toISOString().slice(0, 10),
    });

    // News + public site.
    await ctx.db.insert("news", {
      orgId,
      title: "Season 2026 kicks off!",
      slug: generateSlug("Season 2026 kicks off"),
      body: "We are thrilled to welcome players old and new for the 2026 season. Training starts Tuesday.",
      excerpt: "Welcome to the 2026 season.",
      published: true,
      publishedAt: now - day,
      authorUserId: adminUserId,
    });
    await ctx.db.insert("news", {
      orgId,
      title: "Thank you to our sponsors",
      slug: generateSlug("Thank you to our sponsors"),
      body: "A huge thank you to Corner Cafe and Town Hardware for supporting the club this season.",
      published: true,
      publishedAt: now - 2 * day,
      authorUserId: adminUserId,
    });
    await ctx.db.insert("publicSiteSettings", {
      orgId,
      enabled: true,
      tagline: "Community football since 1975",
      about:
        "Demo United FC is a community football club fielding teams across all ages. We are proudly volunteer-run.",
      contactEmail: "hello@demo-united.example",
    });

    return { status: "seeded", orgId, slug: DEMO_SLUG };
  },
});

/**
 * Repoint the demo organisation at the Clerk org you are currently signed into,
 * so you can explore the seeded data in the authenticated app. Call this once
 * after signing in and selecting an organisation.
 */
export const attachClerkOrg = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in first.");
    const clerkOrgId =
      (identity.orgId as string | undefined) ??
      (identity as unknown as { org_id?: string }).org_id;
    if (!clerkOrgId) throw new Error("Select an organisation first.");

    const demo = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_id", (q) => q.eq("clerkOrgId", DEMO_CLERK_ORG))
      .unique();
    if (!demo) throw new Error("Run seed:run first.");

    await ctx.db.patch(demo._id, { clerkOrgId });

    // Ensure the current user has an owner membership on the demo org.
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (user) {
      const existing = await ctx.db
        .query("memberships")
        .withIndex("by_org_and_clerk_user", (q) =>
          q.eq("orgId", demo._id).eq("clerkUserId", identity.subject),
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("memberships", {
          orgId: demo._id,
          userId: user._id,
          clerkUserId: identity.subject,
          role: "owner",
        });
      }
    }
    return { status: "attached", orgId: demo._id };
  },
});
