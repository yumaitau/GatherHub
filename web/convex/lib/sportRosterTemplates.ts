import type { SportKey } from "./orgConfig";

export type SubstitutionMode =
  | "none"
  | "substitution"
  | "interchange"
  | "rolling"
  | "playing_xi";

export type RosterPositionTemplate = {
  key: string;
  label: string;
  group: string;
  maxSelected?: number;
};

export type SportRosterTemplate = {
  sportKey: SportKey;
  label: string;
  onFieldPlayers: number;
  squadMin: number;
  squadMax: number;
  benchMin?: number;
  benchMax?: number;
  substitutionMode: SubstitutionMode;
  jerseyLabel: "jersey" | "bib" | "shirt" | "number";
  captainRoles: string[];
  positions: RosterPositionTemplate[];
};

const soccerPositions: RosterPositionTemplate[] = [
  { key: "gk", label: "Goalkeeper", group: "Goalkeeper", maxSelected: 1 },
  { key: "lb", label: "Left back", group: "Defenders", maxSelected: 1 },
  { key: "cb", label: "Centre back", group: "Defenders", maxSelected: 2 },
  { key: "rb", label: "Right back", group: "Defenders", maxSelected: 1 },
  { key: "lm", label: "Left midfield", group: "Midfielders", maxSelected: 1 },
  { key: "cm", label: "Centre midfield", group: "Midfielders", maxSelected: 3 },
  { key: "rm", label: "Right midfield", group: "Midfielders", maxSelected: 1 },
  { key: "lw", label: "Left wing", group: "Forwards", maxSelected: 1 },
  { key: "st", label: "Striker", group: "Forwards", maxSelected: 2 },
  { key: "rw", label: "Right wing", group: "Forwards", maxSelected: 1 },
];

export const SPORT_ROSTER_TEMPLATES: Record<SportKey, SportRosterTemplate> = {
  multi_sport: {
    sportKey: "multi_sport",
    label: "Multi-sport",
    onFieldPlayers: 0,
    squadMin: 1,
    squadMax: 40,
    benchMax: 30,
    substitutionMode: "rolling",
    jerseyLabel: "number",
    captainRoles: ["Captain", "Vice captain"],
    positions: [
      { key: "field", label: "Field", group: "Playing group" },
      { key: "bench", label: "Bench", group: "Playing group" },
      { key: "reserve", label: "Reserve", group: "Playing group" },
    ],
  },
  soccer: {
    sportKey: "soccer",
    label: "Soccer",
    onFieldPlayers: 11,
    squadMin: 7,
    squadMax: 18,
    benchMax: 7,
    substitutionMode: "substitution",
    jerseyLabel: "jersey",
    captainRoles: ["Captain", "Vice captain"],
    positions: soccerPositions,
  },
  rugby_union: {
    sportKey: "rugby_union",
    label: "Rugby union",
    onFieldPlayers: 15,
    squadMin: 10,
    squadMax: 23,
    benchMax: 8,
    substitutionMode: "substitution",
    jerseyLabel: "jersey",
    captainRoles: ["Captain", "Vice captain"],
    positions: [
      {
        key: "lhp",
        label: "Loosehead prop",
        group: "Forwards",
        maxSelected: 1,
      },
      { key: "hooker", label: "Hooker", group: "Forwards", maxSelected: 1 },
      {
        key: "thp",
        label: "Tighthead prop",
        group: "Forwards",
        maxSelected: 1,
      },
      { key: "lock", label: "Lock", group: "Forwards", maxSelected: 2 },
      { key: "flanker", label: "Flanker", group: "Forwards", maxSelected: 2 },
      { key: "number_8", label: "Number 8", group: "Forwards", maxSelected: 1 },
      {
        key: "scrum_half",
        label: "Scrum-half",
        group: "Backs",
        maxSelected: 1,
      },
      { key: "fly_half", label: "Fly-half", group: "Backs", maxSelected: 1 },
      { key: "wing", label: "Wing", group: "Backs", maxSelected: 2 },
      { key: "centre", label: "Centre", group: "Backs", maxSelected: 2 },
      { key: "fullback", label: "Fullback", group: "Backs", maxSelected: 1 },
    ],
  },
  rugby_league: {
    sportKey: "rugby_league",
    label: "Rugby league",
    onFieldPlayers: 13,
    squadMin: 9,
    squadMax: 21,
    benchMax: 8,
    substitutionMode: "interchange",
    jerseyLabel: "jersey",
    captainRoles: ["Captain", "Vice captain"],
    positions: [
      { key: "fullback", label: "Fullback", group: "Backs", maxSelected: 1 },
      { key: "wing", label: "Wing", group: "Backs", maxSelected: 2 },
      { key: "centre", label: "Centre", group: "Backs", maxSelected: 2 },
      {
        key: "five_eighth",
        label: "Five-eighth",
        group: "Halves",
        maxSelected: 1,
      },
      { key: "halfback", label: "Halfback", group: "Halves", maxSelected: 1 },
      { key: "prop", label: "Prop", group: "Forwards", maxSelected: 2 },
      { key: "hooker", label: "Hooker", group: "Forwards", maxSelected: 1 },
      {
        key: "second_row",
        label: "Second row",
        group: "Forwards",
        maxSelected: 2,
      },
      { key: "lock", label: "Lock", group: "Forwards", maxSelected: 1 },
    ],
  },
  cricket: {
    sportKey: "cricket",
    label: "Cricket",
    onFieldPlayers: 11,
    squadMin: 8,
    squadMax: 16,
    benchMax: 5,
    substitutionMode: "playing_xi",
    jerseyLabel: "shirt",
    captainRoles: ["Captain", "Vice captain", "Wicketkeeper"],
    positions: [
      { key: "batter", label: "Batter", group: "Batting" },
      { key: "bowler", label: "Bowler", group: "Bowling" },
      { key: "all_rounder", label: "All-rounder", group: "All-rounders" },
      {
        key: "wicketkeeper",
        label: "Wicketkeeper",
        group: "Fielding",
        maxSelected: 1,
      },
      { key: "fielder", label: "Fielder", group: "Fielding" },
    ],
  },
  hockey: {
    sportKey: "hockey",
    label: "Hockey",
    onFieldPlayers: 11,
    squadMin: 7,
    squadMax: 18,
    benchMax: 7,
    substitutionMode: "rolling",
    jerseyLabel: "shirt",
    captainRoles: ["Captain", "Vice captain"],
    positions: [
      {
        key: "goalkeeper",
        label: "Goalkeeper",
        group: "Goalkeeper",
        maxSelected: 1,
      },
      { key: "defender", label: "Defender", group: "Defenders" },
      { key: "midfielder", label: "Midfielder", group: "Midfielders" },
      { key: "forward", label: "Forward", group: "Forwards" },
    ],
  },
  netball: {
    sportKey: "netball",
    label: "Netball",
    onFieldPlayers: 7,
    squadMin: 7,
    squadMax: 12,
    benchMax: 5,
    substitutionMode: "substitution",
    jerseyLabel: "bib",
    captainRoles: ["Captain", "Vice captain"],
    positions: [
      { key: "gs", label: "GS", group: "Circle attack", maxSelected: 1 },
      { key: "ga", label: "GA", group: "Circle attack", maxSelected: 1 },
      { key: "wa", label: "WA", group: "Midcourt", maxSelected: 1 },
      { key: "c", label: "C", group: "Midcourt", maxSelected: 1 },
      { key: "wd", label: "WD", group: "Midcourt", maxSelected: 1 },
      { key: "gd", label: "GD", group: "Circle defence", maxSelected: 1 },
      { key: "gk", label: "GK", group: "Circle defence", maxSelected: 1 },
    ],
  },
  basketball: {
    sportKey: "basketball",
    label: "Basketball",
    onFieldPlayers: 5,
    squadMin: 5,
    squadMax: 12,
    benchMax: 7,
    substitutionMode: "rolling",
    jerseyLabel: "jersey",
    captainRoles: ["Captain", "Vice captain"],
    positions: [
      { key: "pg", label: "Point guard", group: "Guards", maxSelected: 1 },
      { key: "sg", label: "Shooting guard", group: "Guards", maxSelected: 1 },
      { key: "sf", label: "Small forward", group: "Forwards", maxSelected: 1 },
      { key: "pf", label: "Power forward", group: "Forwards", maxSelected: 1 },
      { key: "c", label: "Centre", group: "Centre", maxSelected: 1 },
    ],
  },
  other: {
    sportKey: "other",
    label: "Other sport",
    onFieldPlayers: 0,
    squadMin: 1,
    squadMax: 40,
    benchMax: 30,
    substitutionMode: "rolling",
    jerseyLabel: "number",
    captainRoles: ["Captain", "Vice captain"],
    positions: [
      { key: "field", label: "Field", group: "Playing group" },
      { key: "bench", label: "Bench", group: "Playing group" },
      { key: "reserve", label: "Reserve", group: "Playing group" },
    ],
  },
};

export function rosterTemplateForSport(
  sportKey: SportKey | undefined,
): SportRosterTemplate {
  return SPORT_ROSTER_TEMPLATES[sportKey ?? "multi_sport"];
}

export function rosterPositionForKey(
  template: SportRosterTemplate,
  key: string | undefined | null,
) {
  if (!key) return null;
  return template.positions.find((position) => position.key === key) ?? null;
}
