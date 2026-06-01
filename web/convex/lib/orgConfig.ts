import { ConvexError } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import type { AuthContext } from "./auth";

export const ORGANIZATION_KINDS = [
  "sports_club",
  "community_org",
  "field_service",
  "waste_operator",
  "logistics",
  "school_group",
  "event_company",
  "other",
] as const;

export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export const ORGANIZATION_MODULE_KEYS = [
  "core",
  "people",
  "teams",
  "events",
  "announcements",
  "assets",
  "volunteers",
  "training",
  "tasks",
  "public_site",
  "sponsors",
  "news",
  "sport",
  "soccer",
  "field_service",
  "logistics",
  "waste",
  "safety",
] as const;

export type OrganizationModuleKey = (typeof ORGANIZATION_MODULE_KEYS)[number];

export const SPORT_KEYS = [
  "multi_sport",
  "soccer",
  "rugby_union",
  "rugby_league",
  "cricket",
  "hockey",
  "netball",
  "basketball",
  "other",
] as const;

export type SportKey = (typeof SPORT_KEYS)[number];

export type OrganizationTerminology = NonNullable<
  Doc<"organizations">["terminology"]
>;

type TemplateDefinition = {
  key: string;
  label: string;
  kind: OrganizationKind;
  sportKey?: SportKey;
  description: string;
  modules: OrganizationModuleKey[];
  terminology: OrganizationTerminology;
};

type EffectiveModuleRow = {
  key: OrganizationModuleKey;
  enabled: boolean;
  version?: string;
  configJson?: string;
};

const BASE_MODULES: OrganizationModuleKey[] = [
  "core",
  "people",
  "teams",
  "events",
  "announcements",
  "assets",
  "training",
  "tasks",
];

const COMMUNITY_MODULES: OrganizationModuleKey[] = [
  ...BASE_MODULES,
  "volunteers",
  "public_site",
  "sponsors",
  "news",
];

const SPORTS_MODULES: OrganizationModuleKey[] = [...COMMUNITY_MODULES, "sport"];

function sportTerminology(
  sportSingular: string,
  overrides: Partial<OrganizationTerminology> = {},
): OrganizationTerminology {
  return {
    ...DEFAULT_TERMINOLOGY,
    orgSingular: "club",
    orgPlural: "clubs",
    memberSingular: "member",
    memberPlural: "members",
    teamSingular: "team",
    teamPlural: "teams",
    eventSingular: "fixture",
    eventPlural: "fixtures",
    assetSingular: "kit",
    assetPlural: "kit",
    sportSingular,
    sportPlural: sportSingular,
    registrationSingular: "player registration",
    registrationPlural: "player registrations",
    ...overrides,
  };
}

export const DEFAULT_TERMINOLOGY: OrganizationTerminology = {
  orgSingular: "organisation",
  orgPlural: "organisations",
  memberSingular: "member",
  memberPlural: "members",
  teamSingular: "team",
  teamPlural: "teams",
  eventSingular: "event",
  eventPlural: "events",
  assetSingular: "asset",
  assetPlural: "assets",
  volunteerSingular: "volunteer",
  volunteerPlural: "volunteers",
  sponsorSingular: "sponsor",
  sponsorPlural: "sponsors",
  newsSingular: "news",
  newsPlural: "news",
  taskSingular: "task",
  taskPlural: "tasks",
  certificationSingular: "certification",
  certificationPlural: "certifications",
  sportSingular: "sport",
  sportPlural: "sports",
  competitionSingular: "competition",
  competitionPlural: "competitions",
  divisionSingular: "division",
  divisionPlural: "divisions",
  ageGroupSingular: "age group",
  ageGroupPlural: "age groups",
  registrationSingular: "registration",
  registrationPlural: "registrations",
  gradingSingular: "grading",
};

const TEMPLATES: Record<string, TemplateDefinition> = {
  sports_club: {
    key: "sports_club",
    label: "Sports club",
    kind: "sports_club",
    sportKey: "multi_sport",
    description:
      "General team sport club with members, teams, events, assets, volunteers, tasks, sponsors, and news.",
    modules: SPORTS_MODULES,
    terminology: sportTerminology("sport", {
      eventSingular: "event",
      eventPlural: "events",
      assetSingular: "asset",
      assetPlural: "assets",
      registrationSingular: "registration",
      registrationPlural: "registrations",
    }),
  },
  soccer_club: {
    key: "soccer_club",
    label: "Soccer club",
    kind: "sports_club",
    sportKey: "soccer",
    description:
      "Soccer-specific registrations, grading, age groups, divisions, and competitions.",
    modules: [...SPORTS_MODULES, "soccer"],
    terminology: sportTerminology("soccer", {
      eventSingular: "event",
      eventPlural: "events",
    }),
  },
  rugby_union_club: {
    key: "rugby_union_club",
    label: "Rugby union club",
    kind: "sports_club",
    sportKey: "rugby_union",
    description:
      "Rugby union teams, fixtures, kit, volunteers, age groups, competitions, and grading lists.",
    modules: SPORTS_MODULES,
    terminology: sportTerminology("rugby union", {
      divisionSingular: "grade",
      divisionPlural: "grades",
      gradingSingular: "grading",
    }),
  },
  rugby_league_club: {
    key: "rugby_league_club",
    label: "Rugby league club",
    kind: "sports_club",
    sportKey: "rugby_league",
    description:
      "Rugby league teams, fixtures, kit, volunteers, age groups, competitions, and grading lists.",
    modules: SPORTS_MODULES,
    terminology: sportTerminology("rugby league", {
      divisionSingular: "grade",
      divisionPlural: "grades",
      gradingSingular: "grading",
    }),
  },
  cricket_club: {
    key: "cricket_club",
    label: "Cricket club",
    kind: "sports_club",
    sportKey: "cricket",
    description:
      "Cricket teams, fixtures, seasons, equipment, volunteers, competitions, and player records.",
    modules: SPORTS_MODULES,
    terminology: sportTerminology("cricket", {
      teamSingular: "side",
      teamPlural: "sides",
      eventSingular: "fixture",
      eventPlural: "fixtures",
      assetSingular: "equipment",
      assetPlural: "equipment",
      divisionSingular: "grade",
      divisionPlural: "grades",
    }),
  },
  hockey_club: {
    key: "hockey_club",
    label: "Hockey club",
    kind: "sports_club",
    sportKey: "hockey",
    description:
      "Hockey teams, fixtures, kit, volunteers, age groups, competitions, and player records.",
    modules: SPORTS_MODULES,
    terminology: sportTerminology("hockey"),
  },
  netball_club: {
    key: "netball_club",
    label: "Netball club",
    kind: "sports_club",
    sportKey: "netball",
    description:
      "Netball teams, fixtures, kit, volunteers, age groups, competitions, and player records.",
    modules: SPORTS_MODULES,
    terminology: sportTerminology("netball", {
      divisionSingular: "grade",
      divisionPlural: "grades",
    }),
  },
  basketball_club: {
    key: "basketball_club",
    label: "Basketball club",
    kind: "sports_club",
    sportKey: "basketball",
    description:
      "Basketball teams, fixtures, kit, volunteers, age groups, competitions, and player records.",
    modules: SPORTS_MODULES,
    terminology: sportTerminology("basketball", {
      divisionSingular: "grade",
      divisionPlural: "grades",
    }),
  },
  community_org: {
    key: "community_org",
    label: "Community organisation",
    kind: "community_org",
    description:
      "Programs, volunteers, events, assets, tasks, public updates, and sponsors.",
    modules: COMMUNITY_MODULES,
    terminology: {
      ...DEFAULT_TERMINOLOGY,
      teamSingular: "group",
      teamPlural: "groups",
      eventSingular: "activity",
      eventPlural: "activities",
      sponsorSingular: "supporter",
      sponsorPlural: "supporters",
    },
  },
  field_service: {
    key: "field_service",
    label: "Field service",
    kind: "field_service",
    description:
      "Crews, jobs, assets, safety, training, tasking, and field operations.",
    modules: [...BASE_MODULES, "field_service", "safety"],
    terminology: {
      ...DEFAULT_TERMINOLOGY,
      memberSingular: "worker",
      memberPlural: "workers",
      teamSingular: "crew",
      teamPlural: "crews",
      eventSingular: "job",
      eventPlural: "jobs",
      assetSingular: "equipment",
      assetPlural: "equipment",
    },
  },
  waste_operator: {
    key: "waste_operator",
    label: "Waste operator",
    kind: "waste_operator",
    description:
      "Crews, routes, jobs, vehicles, bins, chain-of-custody, and safety operations.",
    modules: [...BASE_MODULES, "field_service", "waste", "safety"],
    terminology: {
      ...DEFAULT_TERMINOLOGY,
      memberSingular: "worker",
      memberPlural: "workers",
      teamSingular: "crew",
      teamPlural: "crews",
      eventSingular: "job",
      eventPlural: "jobs",
      assetSingular: "vehicle or bin",
      assetPlural: "vehicles and bins",
    },
  },
  logistics: {
    key: "logistics",
    label: "Logistics",
    kind: "logistics",
    description:
      "Drivers, crews, routes, jobs, fleet assets, tasking, training, and safety.",
    modules: [...BASE_MODULES, "logistics", "safety"],
    terminology: {
      ...DEFAULT_TERMINOLOGY,
      memberSingular: "worker",
      memberPlural: "workers",
      teamSingular: "crew",
      teamPlural: "crews",
      eventSingular: "run",
      eventPlural: "runs",
      assetSingular: "vehicle",
      assetPlural: "vehicles",
    },
  },
  school_group: {
    key: "school_group",
    label: "School group",
    kind: "school_group",
    description:
      "Students, groups, activities, assets, volunteers, training, and tasks.",
    modules: [...COMMUNITY_MODULES],
    terminology: {
      ...DEFAULT_TERMINOLOGY,
      memberSingular: "participant",
      memberPlural: "participants",
      teamSingular: "group",
      teamPlural: "groups",
      eventSingular: "activity",
      eventPlural: "activities",
    },
  },
  event_company: {
    key: "event_company",
    label: "Event company",
    kind: "event_company",
    description:
      "Crews, events, equipment, training, tasking, sponsors, public updates, and safety.",
    modules: [...COMMUNITY_MODULES, "safety"],
    terminology: {
      ...DEFAULT_TERMINOLOGY,
      memberSingular: "crew member",
      memberPlural: "crew",
      teamSingular: "crew",
      teamPlural: "crews",
      eventSingular: "event",
      eventPlural: "events",
      assetSingular: "equipment",
      assetPlural: "equipment",
    },
  },
  other: {
    key: "other",
    label: "Other organisation",
    kind: "other",
    description:
      "Flexible baseline with people, teams, events, assets, training, and tasks.",
    modules: BASE_MODULES,
    terminology: DEFAULT_TERMINOLOGY,
  },
};

const DEFAULT_TEMPLATE = TEMPLATES.sports_club!;

export function listVerticalTemplates() {
  return Object.values(TEMPLATES).map(
    ({ key, label, kind, sportKey, description, modules, terminology }) => ({
      key,
      label,
      kind,
      sportKey,
      description,
      modules,
      terminology,
    }),
  );
}

export function templateFor(
  kind?: string,
  templateKey?: string,
): TemplateDefinition {
  if (templateKey && TEMPLATES[templateKey]) return TEMPLATES[templateKey];
  const byKind = Object.values(TEMPLATES).find(
    (template) => template.kind === kind,
  );
  return byKind ?? DEFAULT_TEMPLATE;
}

function cleanTerminology(
  terminology: Partial<OrganizationTerminology> | undefined,
): Partial<OrganizationTerminology> {
  if (!terminology) return {};
  return Object.fromEntries(
    Object.entries(terminology)
      .map(([key, value]) => [key, value?.trim()])
      .filter(([, value]) => Boolean(value)),
  ) as Partial<OrganizationTerminology>;
}

export function normalizedProfileInput(args: {
  kind?: OrganizationKind;
  templateKey?: string;
  sportKey?: SportKey;
  terminology?: Partial<OrganizationTerminology>;
}) {
  const template = templateFor(args.kind, args.templateKey);
  const kind = args.kind ?? template.kind;
  const templateKey = args.templateKey ?? template.key;
  const sportKey = args.sportKey ?? template.sportKey;
  return {
    kind,
    templateKey,
    sportKey,
    terminology: {
      ...template.terminology,
      ...cleanTerminology(args.terminology),
    },
  };
}

function defaultModuleRowsForOrg(
  org: Doc<"organizations">,
): EffectiveModuleRow[] {
  const template = templateFor(org.kind, org.templateKey);
  const defaults = new Set(template.modules);
  if (org.sportKey) defaults.add("sport");
  if (org.soccerMode) {
    defaults.add("sport");
    defaults.add("soccer");
  }
  return ORGANIZATION_MODULE_KEYS.map((key) => ({
    key,
    enabled: defaults.has(key),
    version: "1",
    configJson: undefined as string | undefined,
  }));
}

async function explicitModuleRows(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
) {
  return await ctx.db
    .query("organizationModules")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
}

export async function effectiveOrgProfile(
  ctx: QueryCtx | MutationCtx,
  org: Doc<"organizations">,
) {
  const profile = normalizedProfileInput({
    kind: org.kind,
    templateKey:
      org.templateKey ?? (org.soccerMode ? "soccer_club" : undefined),
    sportKey: org.sportKey ?? (org.soccerMode ? "soccer" : undefined),
    terminology: org.terminology,
  });
  const defaults = defaultModuleRowsForOrg({
    ...org,
    kind: profile.kind,
    templateKey: profile.templateKey,
  });
  const explicit = await explicitModuleRows(ctx, org._id);
  const byKey = new Map<OrganizationModuleKey, EffectiveModuleRow>(
    defaults.map((row) => [row.key, row]),
  );
  for (const row of explicit) {
    byKey.set(row.key, {
      key: row.key,
      enabled: row.enabled,
      version: row.version,
      configJson: row.configJson,
    });
  }
  return {
    kind: profile.kind,
    templateKey: profile.templateKey,
    sportKey: profile.sportKey,
    terminology: profile.terminology,
    modules: ORGANIZATION_MODULE_KEYS.map((key) => byKey.get(key)!),
  };
}

export async function seedOrganizationProfile(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  input: {
    kind?: OrganizationKind;
    templateKey?: string;
    sportKey?: SportKey;
    terminology?: Partial<OrganizationTerminology>;
    soccerMode?: boolean;
  } = {},
) {
  const profile = normalizedProfileInput({
    ...input,
    sportKey: input.soccerMode ? "soccer" : input.sportKey,
  });
  const template = templateFor(profile.kind, profile.templateKey);
  const enabled = new Set(template.modules);
  if (input.soccerMode) {
    enabled.add("sport");
    enabled.add("soccer");
  }
  await ctx.db.patch(orgId, {
    kind: profile.kind,
    templateKey: profile.templateKey,
    sportKey: profile.sportKey,
    terminology: profile.terminology,
    soccerMode: enabled.has("soccer"),
    profileUpdatedAt: Date.now(),
  });
  await replaceOrganizationModules(ctx, orgId, enabled);
}

export async function replaceOrganizationModules(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  enabled: Set<OrganizationModuleKey>,
) {
  const existing = await explicitModuleRows(ctx, orgId);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  for (const key of ORGANIZATION_MODULE_KEYS) {
    await ctx.db.insert("organizationModules", {
      orgId,
      key,
      enabled: enabled.has(key),
      version: "1",
      updatedAt: now,
    });
  }
}

export async function ensureOrganizationProfile(
  ctx: MutationCtx,
  org: Doc<"organizations">,
) {
  const explicit = await explicitModuleRows(ctx, org._id);
  if (
    org.kind &&
    org.templateKey &&
    org.terminology &&
    (org.kind !== "sports_club" || org.sportKey) &&
    explicit.length > 0
  ) {
    return;
  }
  await seedOrganizationProfile(ctx, org._id, {
    kind: org.kind ?? "sports_club",
    templateKey:
      org.templateKey ?? (org.soccerMode ? "soccer_club" : "sports_club"),
    sportKey: org.sportKey ?? (org.soccerMode ? "soccer" : undefined),
    terminology: org.terminology,
    soccerMode: org.soccerMode,
  });
}

export async function isModuleEnabled(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  key: OrganizationModuleKey,
) {
  const profile = await effectiveOrgProfile(ctx, auth.org);
  return profile.modules.some((module) => module.key === key && module.enabled);
}

export async function requireModule(
  ctx: QueryCtx | MutationCtx,
  auth: AuthContext,
  key: OrganizationModuleKey,
) {
  if (await isModuleEnabled(ctx, auth, key)) return;
  throw new ConvexError({
    code: "module_disabled",
    module: key,
    message: `The ${key.replace(/_/g, " ")} module is disabled for this organisation.`,
  });
}
