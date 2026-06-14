import { internalMutation, type MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { generateTagId, generateSlug } from "./lib/ids";
import { seedAllDefaultsForOrg } from "./taxonomies";
import { seedOrganizationProfile } from "./lib/orgConfig";
import { ensureOrganizationRoles } from "./lib/capabilities";

// Both entry points below are `internalMutation` — callable from
// `npx convex run` with a deploy key, never reachable from the client
// API surface. Previously plain `mutation`, which let any signed-in
// user grant themselves ownership of the demo org via the public API.

/**
 * Seed a self-contained demo club ("Demo United FC") with members, teams,
 * events, assets, sponsors and news. Idempotent: if the demo org already
 * exists it is left untouched.
 *
 * Run with: `npx convex run seed:run`  (or `npm run seed`).
 *
 * The demo org is looked up by its slug ("demo-united"). To explore the
 * seeded data while signed in, call `seed:claimDemo` once after signing in —
 * it grants you ownership and sets the demo org as your active club. For the
 * public site, visit /club/demo-united.
 */

const DEMO_SLUG = "demo-united";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_SLUG))
      .unique();
    if (existing) {
      const fleet = await seedFleetDemoOrgs(ctx);
      return { status: "already-seeded", orgId: existing._id, fleet };
    }

    const now = Date.now();
    const day = 86_400_000;

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

    const orgId = await ctx.db.insert("organizations", {
      name: "Demo United FC",
      slug: DEMO_SLUG,
      createdBy: adminUserId,
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: adminUserId,
      role: "owner",
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: coachUserId,
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

    // Guardian + emergency contact examples.
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
        | "apparel"
        | "equipment"
        | "tool"
        | "electronics"
        | "av_equipment"
        | "safety_equipment"
        | "furniture"
        | "vehicle"
        | "key"
        | "media"
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
        category: "apparel",
        status: "available",
        value: 800,
        sponsored: true,
      },
      {
        name: "Match Ball Bag",
        category: "equipment",
        status: "checked_out",
        value: 120,
        custodianIdx: 0,
      },
      {
        name: "Training Cones (x20)",
        category: "equipment",
        status: "available",
        value: 60,
      },
      {
        name: "Portable Goal",
        category: "equipment",
        status: "maintenance",
        value: 450,
      },
      {
        name: "Club Gazebo 3x3",
        category: "furniture",
        status: "available",
        value: 300,
      },
      {
        name: "First Aid Kit",
        category: "safety_equipment",
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
        category: "electronics",
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

    const fleet = await seedFleetDemoOrgs(ctx);
    return { status: "seeded", orgId, slug: DEMO_SLUG, fleet };
  },
});

async function seedFleetDemoOrgs(ctx: MutationCtx) {
  const logistics = await seedLogisticsDemo(ctx);
  const school = await seedSchoolDemo(ctx);
  const community = await seedCommunityFleetDemo(ctx);
  return { logistics, school, community };
}

function isoFrom(now: number, days: number) {
  return new Date(now + days * 86_400_000).toISOString().slice(0, 10);
}

function atHour(now: number, days: number, hour: number) {
  const d = new Date(now + days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

async function ensureFleetOrg(
  ctx: MutationCtx,
  input: {
    slug: string;
    name: string;
    templateKey: string;
    kind: "logistics" | "school_group" | "community_org";
    adminEmail: string;
    adminName: [string, string];
  },
) {
  const existing = await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", input.slug))
    .unique();
  if (existing) return { orgId: existing._id, seeded: false };

  const adminUserId = await ctx.db.insert("users", {
    clerkUserId: `user_${input.slug}_admin`,
    email: input.adminEmail,
    firstName: input.adminName[0],
    lastName: input.adminName[1],
  });
  const orgId = await ctx.db.insert("organizations", {
    name: input.name,
    slug: input.slug,
    createdBy: adminUserId,
  });
  await seedOrganizationProfile(ctx, orgId, {
    kind: input.kind,
    templateKey: input.templateKey,
  });
  const org = await ctx.db.get(orgId);
  if (org) await ensureOrganizationRoles(ctx, org);
  await ctx.db.insert("memberships", {
    orgId,
    userId: adminUserId,
    role: "owner",
    roleKey: "owner",
  });
  await seedAllDefaultsForOrg(ctx, orgId);
  return { orgId, adminUserId, seeded: true };
}

async function seedLogisticsDemo(ctx: MutationCtx) {
  const now = Date.now();
  const org = await ensureFleetOrg(ctx, {
    slug: "demo-logistics-fleet",
    name: "Demo Logistics Co",
    templateKey: "logistics",
    kind: "logistics",
    adminEmail: "ops@demo-logistics.example",
    adminName: ["Mia", "Dispatcher"],
  });
  if (!org.seeded || !org.adminUserId)
    return { status: "already-seeded", orgId: org.orgId };
  const { orgId, adminUserId } = org;

  const depots: Id<"depots">[] = [];
  for (const name of ["North Depot", "Airport Depot", "South Yard"]) {
    depots.push(
      await ctx.db.insert("depots", {
        orgId,
        name,
        address: `${name}, Canberra ACT`,
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }

  const driverIds: Id<"drivers">[] = [];
  for (let i = 0; i < 12; i++) {
    const licenceOffset = i === 2 ? -10 : 80 + i * 20;
    driverIds.push(
      await ctx.db.insert("drivers", {
        orgId,
        name: `Driver ${i + 1}`,
        email: `driver${i + 1}@demo-logistics.example`,
        phone: `+61 400 100 ${String(i + 1).padStart(3, "0")}`,
        emergencyContactName: "Operations Desk",
        emergencyContactPhone: "+61 2 6200 0000",
        driverType: i % 3 === 0 ? "contractor" : "employee",
        licenceNumber: `DL${10000 + i}`,
        licenceClass: i % 2 === 0 ? "HR" : "C",
        licenceExpiry: isoFrom(now, licenceOffset),
        medicalClearanceExpiry: isoFrom(now, 120 + i * 10),
        policeCheckExpiry: isoFrom(now, 200 + i * 12),
        inductionStatus: "complete",
        approvedVehicleTypes: i % 2 === 0 ? ["truck", "van"] : ["van", "ute"],
        status: i === 2 ? "expired_documents" : "active",
        depotId: depots[i % depots.length],
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }

  const vehicleIds: Id<"vehicles">[] = [];
  const vehicleDefs = [
    ["Prime Mover 01", "TRK101", "truck", 181000, 25, 40],
    ["Prime Mover 02", "TRK102", "truck", 146500, -7, 120],
    ["Rigid Truck 03", "TRK203", "truck", 98000, 75, 20],
    ["Delivery Van 04", "VAN404", "van", 62300, 180, 10],
    ["Delivery Van 05", "VAN405", "van", 57100, 22, 220],
    ["Ute 06", "UTE606", "ute", 38200, 310, 310],
    ["Trailer 07", "TRL707", "trailer", 0, 42, 42],
    ["Refrigerated Van 08", "FRZ808", "van", 84600, 14, 65],
  ] as const;
  for (let i = 0; i < vehicleDefs.length; i++) {
    const [name, rego, type, odo, regoDays, insuranceDays] = vehicleDefs[i]!;
    vehicleIds.push(
      await ctx.db.insert("vehicles", {
        orgId,
        name,
        registrationNumber: rego,
        registrationState: "ACT",
        make: type === "truck" ? "Isuzu" : "Toyota",
        model: type === "truck" ? "F Series" : "HiAce",
        year: 2020 + (i % 4),
        vehicleType: type,
        fuelType: type === "trailer" ? undefined : "diesel",
        odometer: odo,
        status: i === 1 ? "unavailable" : i === 4 ? "booked" : "active",
        depotId: depots[i % depots.length],
        primaryDriverId: driverIds[i % driverIds.length],
        insuranceProvider: "Demo Mutual",
        insuranceExpiry: isoFrom(now, insuranceDays),
        insuranceStatus:
          insuranceDays < 0
            ? "expired"
            : insuranceDays <= 30
              ? "due_soon"
              : "current",
        regoExpiry: isoFrom(now, regoDays),
        regoStatus:
          regoDays < 0 ? "expired" : regoDays <= 30 ? "due_soon" : "current",
        inspectionExpiry: isoFrom(now, 45 + i * 8),
        inspectionStatus: i === 7 ? "due_soon" : "current",
        roadworthyExpiry: isoFrom(now, 180 + i * 12),
        roadworthyStatus: "current",
        serviceIntervalKm: 10000,
        serviceIntervalMonths: 6,
        nextServiceDueDate: isoFrom(now, i === 2 ? -3 : 35 + i * 7),
        nextServiceDueOdometer: odo + (i === 0 ? -500 : 2500 + i * 300),
        lastServiceDate: isoFrom(now, -160),
        lastServiceOdometer: Math.max(0, odo - 10000),
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }

  const projectIds: Id<"projects">[] = [];
  for (const [name, budget] of [
    ["Metro Retail Runs", 18000],
    ["Airport Freight", 26000],
    ["Regional Medical Deliveries", 14000],
    ["Cold Chain Trial", 32000],
  ] as const) {
    projectIds.push(
      await ctx.db.insert("projects", {
        orgId,
        name,
        clientName: name.split(" ")[0],
        status: "active",
        startDate: isoFrom(now, -20),
        endDate: isoFrom(now, 60),
        budget,
        revenue: budget * 1.35,
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }

  for (let i = 0; i < 20; i++) {
    await ctx.db.insert("jobs", {
      orgId,
      title: `Delivery Run ${String(i + 1).padStart(2, "0")}`,
      referenceNumber: `JOB-${1000 + i}`,
      customerName: [
        "Acme Retail",
        "Capital Foods",
        "Airport Freight",
        "Regional Health",
      ][i % 4],
      projectId: projectIds[i % projectIds.length],
      pickupLocation: "North Depot",
      dropoffLocation: `Customer Site ${i + 1}`,
      startDateTime: atHour(now, i - 6, 8 + (i % 4)),
      endDateTime: atHour(now, i - 6, 11 + (i % 4)),
      assignedVehicleId: vehicleIds[i % vehicleIds.length],
      assignedDriverId: driverIds[i % driverIds.length],
      jobType: i % 5 === 0 ? "pickup" : "delivery",
      status: i < 8 ? "completed" : i < 15 ? "assigned" : "scheduled",
      estimatedDistance: 45 + i * 7,
      actualDistance: i < 8 ? 44 + i * 7 : undefined,
      estimatedCost: 220 + i * 15,
      actualCost: i < 8 ? 230 + i * 12 : undefined,
      fuelCost: i < 8 ? 60 + i * 3 : undefined,
      labourCost: i < 8 ? 120 + i * 6 : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
      updatedBy: adminUserId,
      completedAt: i < 8 ? atHour(now, i - 6, 12) : undefined,
    });
  }

  await seedFleetOperationalRows(ctx, {
    orgId,
    adminUserId,
    vehicleIds,
    driverIds,
    projectIds,
    now,
    prefix: "logistics",
  });
  return { status: "seeded", orgId };
}

async function seedSchoolDemo(ctx: MutationCtx) {
  const now = Date.now();
  const org = await ensureFleetOrg(ctx, {
    slug: "demo-school-transport",
    name: "Demo College Transport",
    templateKey: "school_group",
    kind: "school_group",
    adminEmail: "transport@demo-college.example",
    adminName: ["Priya", "Transport"],
  });
  if (!org.seeded || !org.adminUserId)
    return { status: "already-seeded", orgId: org.orgId };
  const { orgId, adminUserId } = org;
  const depotId = await ctx.db.insert("depots", {
    orgId,
    name: "Main Campus",
    address: "100 School Road",
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  const driverIds: Id<"drivers">[] = [];
  for (let i = 0; i < 8; i++) {
    driverIds.push(
      await ctx.db.insert("drivers", {
        orgId,
        name: `Staff Driver ${i + 1}`,
        email: `staff.driver${i + 1}@demo-college.example`,
        driverType: "staff",
        licenceClass: "MR",
        licenceExpiry: isoFrom(now, 120 + i * 30),
        workingWithChildrenCheckExpiry: isoFrom(
          now,
          i === 1 ? 12 : 180 + i * 15,
        ),
        policeCheckExpiry: isoFrom(now, 200 + i * 10),
        inductionStatus: i === 6 ? "pending" : "complete",
        approvedVehicleTypes: ["bus", "van"],
        status: i === 6 ? "pending_approval" : "active",
        depotId,
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }
  const vehicleIds: Id<"vehicles">[] = [];
  for (let i = 0; i < 4; i++) {
    vehicleIds.push(
      await ctx.db.insert("vehicles", {
        orgId,
        name: `School Bus ${i + 1}`,
        registrationNumber: `BUS10${i}`,
        registrationState: "NSW",
        make: "Hino",
        model: "Poncho",
        year: 2019 + i,
        vehicleType: "bus",
        fuelType: "diesel",
        odometer: 42000 + i * 9000,
        status: i === 3 ? "in_maintenance" : "active",
        depotId,
        primaryDriverId: driverIds[i],
        insuranceProvider: "Education Mutual",
        insuranceExpiry: isoFrom(now, 90 + i * 20),
        insuranceStatus: "current",
        regoExpiry: isoFrom(now, i === 0 ? 20 : 160 + i * 25),
        regoStatus: i === 0 ? "due_soon" : "current",
        inspectionExpiry: isoFrom(now, 35 + i * 20),
        inspectionStatus: i === 0 ? "due_soon" : "current",
        roadworthyExpiry: isoFrom(now, 80 + i * 20),
        roadworthyStatus: "current",
        serviceIntervalKm: 8000,
        serviceIntervalMonths: 6,
        nextServiceDueDate: isoFrom(now, i === 3 ? -2 : 45 + i * 10),
        nextServiceDueOdometer: 44000 + i * 9000,
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }
  const projectId = await ctx.db.insert("projects", {
    orgId,
    name: "Term 3 Excursions",
    clientName: "Demo College",
    status: "active",
    budget: 9000,
    startDate: isoFrom(now, -7),
    endDate: isoFrom(now, 75),
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  for (let i = 0; i < 10; i++) {
    await ctx.db.insert("jobs", {
      orgId,
      title:
        i % 2 === 0
          ? `Year ${5 + i} Excursion`
          : `Route ${i} Student Transport`,
      referenceNumber: `SCH-${200 + i}`,
      customerName: "Students",
      projectId,
      pickupLocation: "Main Campus",
      dropoffLocation: i % 2 === 0 ? "Museum" : "North Route",
      startDateTime: atHour(now, i + 1, 8),
      endDateTime: atHour(now, i + 1, 15),
      assignedVehicleId: vehicleIds[i % vehicleIds.length],
      assignedDriverId: driverIds[i % driverIds.length],
      jobType: i % 2 === 0 ? "excursion" : "school_run",
      status: "assigned",
      estimatedDistance: 35 + i * 8,
      estimatedCost: 180 + i * 20,
      cargoPassengersEquipment: "Students and teacher aides",
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    });
  }
  await seedFleetOperationalRows(ctx, {
    orgId,
    adminUserId,
    vehicleIds,
    driverIds,
    projectIds: [projectId],
    now,
    prefix: "school",
  });
  return { status: "seeded", orgId };
}

async function seedCommunityFleetDemo(ctx: MutationCtx) {
  const now = Date.now();
  const org = await ensureFleetOrg(ctx, {
    slug: "demo-community-vans",
    name: "Demo Community Transport",
    templateKey: "community_org",
    kind: "community_org",
    adminEmail: "fleet@demo-community.example",
    adminName: ["Noah", "Coordinator"],
  });
  if (!org.seeded || !org.adminUserId)
    return { status: "already-seeded", orgId: org.orgId };
  const { orgId, adminUserId } = org;
  const depotId = await ctx.db.insert("depots", {
    orgId,
    name: "Community Centre",
    address: "12 Main Street",
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  const driverIds: Id<"drivers">[] = [];
  for (let i = 0; i < 10; i++) {
    driverIds.push(
      await ctx.db.insert("drivers", {
        orgId,
        name: `Volunteer Driver ${i + 1}`,
        email: `volunteer${i + 1}@demo-community.example`,
        driverType: "volunteer",
        licenceClass: "C",
        licenceExpiry: isoFrom(now, 80 + i * 25),
        policeCheckExpiry: isoFrom(now, i === 3 ? 9 : 180 + i * 8),
        workingWithChildrenCheckExpiry: isoFrom(now, 220 + i * 5),
        inductionStatus: "complete",
        approvedVehicleTypes: ["van"],
        status: "active",
        depotId,
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }
  const vehicleIds: Id<"vehicles">[] = [];
  for (let i = 0; i < 2; i++) {
    vehicleIds.push(
      await ctx.db.insert("vehicles", {
        orgId,
        name: `Shared Van ${i + 1}`,
        registrationNumber: `VAN90${i}`,
        registrationState: "ACT",
        make: "Kia",
        model: "Carnival",
        year: 2021 + i,
        vehicleType: "van",
        fuelType: "petrol",
        odometer: 31000 + i * 12000,
        status: "active",
        depotId,
        primaryDriverId: driverIds[i],
        insuranceProvider: "Community Cover",
        insuranceExpiry: isoFrom(now, 75 + i * 20),
        insuranceStatus: "current",
        regoExpiry: isoFrom(now, i === 0 ? 14 : 190),
        regoStatus: i === 0 ? "due_soon" : "current",
        inspectionExpiry: isoFrom(now, 50 + i * 20),
        inspectionStatus: "current",
        serviceIntervalKm: 10000,
        serviceIntervalMonths: 12,
        nextServiceDueDate: isoFrom(now, 25 + i * 60),
        nextServiceDueOdometer: 36000 + i * 12000,
        createdAt: now,
        updatedAt: now,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      }),
    );
  }
  const projectId = await ctx.db.insert("projects", {
    orgId,
    name: "Community Transport Program",
    clientName: "Community Members",
    status: "active",
    budget: 3500,
    startDate: isoFrom(now, -30),
    endDate: isoFrom(now, 120),
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  for (let i = 0; i < 8; i++) {
    await ctx.db.insert("jobs", {
      orgId,
      title: `Community Trip ${i + 1}`,
      referenceNumber: `COM-${300 + i}`,
      customerName: "Community booking",
      projectId,
      pickupLocation: "Community Centre",
      dropoffLocation: i % 2 === 0 ? "Medical Centre" : "Shopping Centre",
      startDateTime: atHour(now, i + 1, 9),
      endDateTime: atHour(now, i + 1, 12),
      assignedVehicleId: vehicleIds[i % vehicleIds.length],
      assignedDriverId: driverIds[i % driverIds.length],
      jobType: "community_transport",
      status: "assigned",
      estimatedDistance: 18 + i * 4,
      estimatedCost: 45 + i * 5,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    });
  }
  await seedFleetOperationalRows(ctx, {
    orgId,
    adminUserId,
    vehicleIds,
    driverIds,
    projectIds: [projectId],
    now,
    prefix: "community",
  });
  return { status: "seeded", orgId };
}

async function seedFleetOperationalRows(
  ctx: MutationCtx,
  input: {
    orgId: Id<"organizations">;
    adminUserId: Id<"users">;
    vehicleIds: Id<"vehicles">[];
    driverIds: Id<"drivers">[];
    projectIds: Id<"projects">[];
    now: number;
    prefix: string;
  },
) {
  const { orgId, adminUserId, vehicleIds, driverIds, projectIds, now, prefix } =
    input;
  for (let i = 0; i < Math.min(6, vehicleIds.length + 2); i++) {
    const vehicleId = vehicleIds[i % vehicleIds.length]!;
    await ctx.db.insert("maintenanceRecords", {
      orgId,
      vehicleId,
      maintenanceType: i % 2 === 0 ? "scheduled_service" : "unscheduled_repair",
      dateReported: isoFrom(now, -20 + i),
      scheduledDate: isoFrom(now, i === 1 ? 3 : 20 + i),
      completedDate: i < 2 ? isoFrom(now, -5 + i) : undefined,
      odometer: 30000 + i * 5000,
      vendorMechanic: "Demo Mechanical",
      status: i < 2 ? "completed" : i === 3 ? "in_progress" : "scheduled",
      description: i % 2 === 0 ? "Scheduled service" : "Brake inspection",
      partsCost: 180 + i * 20,
      labourCost: 240 + i * 30,
      totalCost: 420 + i * 50,
      downtimeHours: i + 2,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    });
  }
  for (let i = 0; i < Math.min(4, vehicleIds.length); i++) {
    const critical = i === 1;
    await ctx.db.insert("defectReports", {
      orgId,
      vehicleId: vehicleIds[i]!,
      reporterUserId: adminUserId,
      reporterDriverId: driverIds[i % driverIds.length],
      dateTime: now - i * 86_400_000,
      odometer: 32000 + i * 9000,
      category: critical ? "Brakes" : "Body",
      severity: critical ? "critical" : i === 2 ? "high" : "medium",
      notes: critical
        ? "Brake warning light active"
        : "Minor issue from pre-start check",
      safeToOperate: !critical,
      immediateActionRequired: critical,
      status: critical ? "open" : i === 0 ? "fixed" : "triaged",
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    });
  }
  for (let i = 0; i < 12; i++) {
    const vehicleId = vehicleIds[i % vehicleIds.length]!;
    const driverId = driverIds[i % driverIds.length]!;
    const projectId = projectIds[i % projectIds.length]!;
    await ctx.db.insert("fuelLogs", {
      orgId,
      vehicleId,
      driverId,
      projectId,
      date: isoFrom(now, -25 + i * 2),
      odometer: 30000 + i * 2500,
      litres: 45 + i * 3,
      cost: 90 + i * 8,
      fuelType: "diesel",
      locationStation: "Demo Fuel",
      fullTank: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    });
    await ctx.db.insert("costEntries", {
      orgId,
      date: isoFrom(now, -25 + i * 2),
      category: i % 3 === 0 ? "maintenance" : i % 3 === 1 ? "fuel" : "parking",
      amount: 80 + i * 22,
      taxGst: 8 + i * 2,
      vehicleId,
      driverId,
      projectId,
      notes: `${prefix} demo operating cost`,
      approvalStatus: i % 4 === 0 ? "approved" : "submitted",
      approvedBy: i % 4 === 0 ? adminUserId : undefined,
      approvedAt: i % 4 === 0 ? now : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    });
  }
  for (let i = 0; i < vehicleIds.length; i++) {
    await ctx.db.insert("reminders", {
      orgId,
      type: i % 2 === 0 ? "rego_expiry" : "service_due_date",
      entityType: "vehicle",
      entityId: String(vehicleIds[i]),
      title: i % 2 === 0 ? "Registration renewal due" : "Service due",
      dueAt: now + (7 + i * 5) * 86_400_000,
      triggerAt: now,
      timingDays: 30,
      status: "due",
      severity: "warning",
      sourceKey: `${prefix}:vehicle:${vehicleIds[i]}:seed:${i}`,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (let i = 0; i < Math.min(4, driverIds.length); i++) {
    await ctx.db.insert("reminders", {
      orgId,
      type: i % 2 === 0 ? "licence_expiry" : "wwcc_expiry",
      entityType: "driver",
      entityId: String(driverIds[i]),
      title: i % 2 === 0 ? "Driver licence expiring" : "WWCC expiring",
      dueAt: now + (10 + i * 7) * 86_400_000,
      triggerAt: now,
      timingDays: 30,
      status: "due",
      severity: "warning",
      assignedDriverId: driverIds[i],
      sourceKey: `${prefix}:driver:${driverIds[i]}:seed:${i}`,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const vehicleId of vehicleIds) {
    await ctx.db.insert("auditLogs", {
      orgId,
      actorId: adminUserId,
      entityType: "vehicle",
      entityId: String(vehicleId),
      action: "vehicle_created",
      timestamp: now,
      metadata: JSON.stringify({ source: "seed" }),
    });
  }
}

/**
 * Grant the signed-in user owner membership on the demo organisation and set
 * it as their active club. Call once after signing in to explore the seeded
 * data in the authenticated app.
 */
export const claimDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in first.");

    const demo = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_SLUG))
      .unique();
    if (!demo) throw new Error("Run seed:run first.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) throw new Error("User not yet synced — refresh and retry.");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", demo._id).eq("userId", user._id),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("memberships", {
        orgId: demo._id,
        userId: user._id,
        role: "owner",
      });
    }
    await ctx.db.patch(user._id, { activeOrgId: demo._id });
    return { status: "claimed", orgId: demo._id };
  },
});
