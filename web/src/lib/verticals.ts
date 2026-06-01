export type OrganizationKind =
  | "sports_club"
  | "community_org"
  | "field_service"
  | "waste_operator"
  | "logistics"
  | "school_group"
  | "event_company"
  | "other";

export type OrganizationModuleKey =
  | "core"
  | "people"
  | "teams"
  | "events"
  | "announcements"
  | "assets"
  | "volunteers"
  | "training"
  | "tasks"
  | "public_site"
  | "sponsors"
  | "news"
  | "sport"
  | "soccer"
  | "field_service"
  | "logistics"
  | "waste"
  | "safety";

export type SportKey =
  | "multi_sport"
  | "soccer"
  | "rugby_union"
  | "rugby_league"
  | "cricket"
  | "hockey"
  | "netball"
  | "basketball"
  | "other";

export interface OrganizationTerminology {
  orgSingular?: string;
  orgPlural?: string;
  memberSingular?: string;
  memberPlural?: string;
  teamSingular?: string;
  teamPlural?: string;
  eventSingular?: string;
  eventPlural?: string;
  assetSingular?: string;
  assetPlural?: string;
  volunteerSingular?: string;
  volunteerPlural?: string;
  sponsorSingular?: string;
  sponsorPlural?: string;
  newsSingular?: string;
  newsPlural?: string;
  taskSingular?: string;
  taskPlural?: string;
  certificationSingular?: string;
  certificationPlural?: string;
  sportSingular?: string;
  sportPlural?: string;
  competitionSingular?: string;
  competitionPlural?: string;
  divisionSingular?: string;
  divisionPlural?: string;
  ageGroupSingular?: string;
  ageGroupPlural?: string;
  registrationSingular?: string;
  registrationPlural?: string;
  gradingSingular?: string;
}

export interface OrganizationModule {
  key: OrganizationModuleKey;
  enabled: boolean;
  version?: string;
  configJson?: string;
}

export interface VerticalOrgConfig {
  soccerMode?: boolean;
  kind?: OrganizationKind;
  templateKey?: string;
  sportKey?: SportKey;
  terminology?: OrganizationTerminology;
  modules?: OrganizationModule[];
}

export const MODULE_LABELS: Record<OrganizationModuleKey, string> = {
  core: "Core workspace",
  people: "People",
  teams: "Teams / groups",
  events: "Events / jobs",
  announcements: "Announcements",
  assets: "Assets / equipment",
  volunteers: "Volunteers",
  training: "Training & certifications",
  tasks: "Tasks",
  public_site: "Public website",
  sponsors: "Sponsors / supporters",
  news: "News",
  sport: "Sport",
  soccer: "Soccer",
  field_service: "Field service",
  logistics: "Logistics",
  waste: "Waste operations",
  safety: "Safety & compliance",
};

export const SPORT_LABELS: Record<SportKey, string> = {
  multi_sport: "Multi-sport",
  soccer: "Soccer",
  rugby_union: "Rugby union",
  rugby_league: "Rugby league",
  cricket: "Cricket",
  hockey: "Hockey",
  netball: "Netball",
  basketball: "Basketball",
  other: "Other sport",
};

export const DEFAULT_TERMINOLOGY: Required<OrganizationTerminology> = {
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

const DEFAULT_ENABLED_MODULES: OrganizationModuleKey[] = [
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
];

export function terminology(
  org: VerticalOrgConfig | null | undefined,
): Required<OrganizationTerminology> {
  return {
    ...DEFAULT_TERMINOLOGY,
    ...(org?.terminology ?? {}),
  };
}

export function term<K extends keyof Required<OrganizationTerminology>>(
  org: VerticalOrgConfig | null | undefined,
  key: K,
): Required<OrganizationTerminology>[K] {
  return terminology(org)[key];
}

export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function moduleEnabled(
  org: VerticalOrgConfig | null | undefined,
  key: OrganizationModuleKey,
): boolean {
  if (!org) return false;
  if (org.modules?.length) {
    return Boolean(org.modules.find((module) => module.key === key)?.enabled);
  }
  if (key === "soccer") return Boolean(org.soccerMode);
  if (key === "sport")
    return (
      Boolean(org.soccerMode) ||
      Boolean(org.sportKey) ||
      org.kind === "sports_club"
    );
  return DEFAULT_ENABLED_MODULES.includes(key);
}

export function sportLabel(org: VerticalOrgConfig | null | undefined): string {
  const configured = org?.sportKey ? SPORT_LABELS[org.sportKey] : undefined;
  return configured ?? titleCase(term(org, "sportSingular"));
}

export function sportSectionLabel(
  org: VerticalOrgConfig | null | undefined,
): string {
  return titleCase(term(org, "sportSingular")) || sportLabel(org);
}

export function legacySoccerSurfacesEnabled(
  org: VerticalOrgConfig | null | undefined,
): boolean {
  return moduleEnabled(org, "soccer") || org?.sportKey === "soccer";
}
