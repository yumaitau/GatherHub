import { Doc } from "../_generated/dataModel";

/**
 * Pure helpers for the waste-removal vertical (GX-11): the load state machine,
 * discrepancy detection, and config parsing. No `ctx`/db access so it stays
 * unit-testable and deterministic (callers pass `now`).
 */

export type WasteLoadStatus = Doc<"wasteLoads">["status"];
export type WasteDiscrepancy = Doc<"wasteLoads">["discrepancyFlags"][number];

/** Region-configurable thresholds, read from the `waste` module configJson. */
export type WasteConfig = {
  /** Quantity-mismatch tolerance between pickup and arrival amounts (percent). */
  quantityTolerancePct: number;
  /** Grace after scheduled arrival before a delivery counts as late (hours). */
  lateGraceHours: number;
  /** Region key for compliance wording, e.g. "AU-NSW" or "US". */
  region: string;
  /** Human label shown on manifests/exports, configurable per region. */
  complianceLabel: string;
};

export const DEFAULT_WASTE_CONFIG: WasteConfig = {
  quantityTolerancePct: 10,
  lateGraceHours: 24,
  region: "AU-NSW",
  complianceLabel: "Operational record only — not a legal compliance document.",
};

export function parseWasteConfig(configJson: string | undefined): WasteConfig {
  if (!configJson) return DEFAULT_WASTE_CONFIG;
  try {
    const raw = JSON.parse(configJson) as Partial<WasteConfig>;
    return {
      quantityTolerancePct:
        typeof raw.quantityTolerancePct === "number" &&
        raw.quantityTolerancePct >= 0
          ? raw.quantityTolerancePct
          : DEFAULT_WASTE_CONFIG.quantityTolerancePct,
      lateGraceHours:
        typeof raw.lateGraceHours === "number" && raw.lateGraceHours >= 0
          ? raw.lateGraceHours
          : DEFAULT_WASTE_CONFIG.lateGraceHours,
      region:
        typeof raw.region === "string" && raw.region.trim()
          ? raw.region.trim()
          : DEFAULT_WASTE_CONFIG.region,
      complianceLabel:
        typeof raw.complianceLabel === "string" && raw.complianceLabel.trim()
          ? raw.complianceLabel.trim()
          : DEFAULT_WASTE_CONFIG.complianceLabel,
    };
  } catch {
    return DEFAULT_WASTE_CONFIG;
  }
}

/**
 * Allowed forward transitions of the load state machine. Each field action
 * validates against this so a load can never skip or rewind lifecycle stages.
 */
const ALLOWED_TRANSITIONS: Record<WasteLoadStatus, WasteLoadStatus[]> = {
  scheduled: ["picked_up", "in_transit", "cancelled"],
  picked_up: ["in_transit", "arrived", "cancelled"],
  in_transit: ["arrived", "cancelled"],
  arrived: ["accepted", "rejected"],
  accepted: ["processed"],
  processed: [],
  rejected: ["redirected"],
  redirected: [],
  cancelled: [],
};

export function canTransition(
  from: WasteLoadStatus,
  to: WasteLoadStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Shape needed for discrepancy detection — a saved load or a pending patch. */
export type DiscrepancyInput = {
  status: WasteLoadStatus;
  pickupAmount?: number;
  pickupUnit?: Doc<"wasteLoads">["pickupUnit"];
  arrivalAmount?: number;
  arrivalUnit?: Doc<"wasteLoads">["arrivalUnit"];
  manifestNumber?: string;
  scheduledArrivalAt?: number;
  arrivedAt?: number;
  plannedReceiverPartyId: Doc<"wasteLoads">["plannedReceiverPartyId"];
  actualReceiverPartyId?: Doc<"wasteLoads">["actualReceiverPartyId"];
  quantityTolerancePct?: number;
};

/** Statuses at or past arrival — the point documents/quantities are expected. */
const POST_ARRIVAL: WasteLoadStatus[] = [
  "arrived",
  "accepted",
  "processed",
  "rejected",
  "redirected",
];

/**
 * Detect every discrepancy on a load. Deterministic: derived purely from the
 * load's own fields, so it is safe to recompute on every transition and under
 * mobile retry without producing duplicates.
 */
export function detectDiscrepancies(
  load: DiscrepancyInput,
  config: WasteConfig,
): WasteDiscrepancy[] {
  const flags: WasteDiscrepancy[] = [];
  const postArrival = POST_ARRIVAL.includes(load.status);

  // Quantity mismatch: differing units, or a percentage delta beyond tolerance.
  if (
    typeof load.pickupAmount === "number" &&
    typeof load.arrivalAmount === "number"
  ) {
    const tolerance =
      typeof load.quantityTolerancePct === "number"
        ? load.quantityTolerancePct
        : config.quantityTolerancePct;
    const unitsDiffer =
      Boolean(load.pickupUnit) &&
      Boolean(load.arrivalUnit) &&
      load.pickupUnit !== load.arrivalUnit;
    const base = Math.abs(load.pickupAmount);
    const deltaPct =
      base === 0
        ? load.arrivalAmount === load.pickupAmount
          ? 0
          : Infinity
        : (Math.abs(load.arrivalAmount - load.pickupAmount) / base) * 100;
    if (unitsDiffer || deltaPct > tolerance) {
      flags.push("quantity_mismatch");
    }
  }

  // Missing document: arrived (or later) without a manifest/certificate number.
  if (postArrival && !load.manifestNumber?.trim()) {
    flags.push("missing_document");
  }

  // Late delivery: arrived after the scheduled arrival plus grace.
  if (
    typeof load.arrivedAt === "number" &&
    typeof load.scheduledArrivalAt === "number" &&
    load.arrivedAt >
      load.scheduledArrivalAt + config.lateGraceHours * 60 * 60 * 1000
  ) {
    flags.push("late_delivery");
  }

  // Wrong party: accepted by a facility other than the planned receiver.
  if (
    load.actualReceiverPartyId &&
    load.actualReceiverPartyId !== load.plannedReceiverPartyId
  ) {
    flags.push("wrong_party");
  }

  // Rejected load is itself a discrepancy worth surfacing on the dashboard.
  if (load.status === "rejected") {
    flags.push("rejected_load");
  }

  return flags;
}

const DISCREPANCY_LABELS: Record<WasteDiscrepancy, string> = {
  quantity_mismatch: "Quantity mismatch",
  missing_document: "Missing document",
  late_delivery: "Late delivery",
  rejected_load: "Rejected load",
  wrong_party: "Wrong party",
};

export function discrepancyLabel(flag: WasteDiscrepancy): string {
  return DISCREPANCY_LABELS[flag] ?? flag;
}
