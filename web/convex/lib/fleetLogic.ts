const DAY_MS = 24 * 60 * 60 * 1000;

export type DueState = "ok" | "due_soon" | "overdue";

export type ServiceInput = {
  currentOdometer?: number;
  currentEngineHours?: number;
  lastServiceDate?: string;
  lastServiceOdometer?: number;
  lastServiceEngineHours?: number;
  serviceIntervalKm?: number;
  serviceIntervalMonths?: number;
  serviceIntervalEngineHours?: number;
  nextServiceDueDate?: string;
  nextServiceDueOdometer?: number;
  nextServiceDueEngineHours?: number;
};

export type ServiceDueState = {
  state: DueState;
  dueByDate: boolean;
  dueByOdometer: boolean;
  dueByEngineHours: boolean;
  nextServiceDueDate?: string;
  nextServiceDueOdometer?: number;
  nextServiceDueEngineHours?: number;
  daysUntilNextService?: number;
  distanceUntilNextService?: number;
  engineHoursUntilNextService?: number;
  reasons: string[];
};

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isoToMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : ms;
}

export function addMonths(iso: string, months: number): string | undefined {
  const ms = isoToMs(iso);
  if (ms === null) return undefined;
  const date = new Date(ms);
  date.setUTCMonth(date.getUTCMonth() + months);
  return isoDate(date.getTime());
}

export function daysUntil(iso: string | undefined, now = Date.now()): number {
  const ms = isoToMs(iso);
  if (ms === null) return Number.POSITIVE_INFINITY;
  return Math.ceil((ms - startOfUtcDay(now)) / DAY_MS);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function renewalState(
  expiryDate: string | undefined,
  now = Date.now(),
  dueSoonDays = 30,
): "current" | "due_soon" | "expired" {
  const days = daysUntil(expiryDate, now);
  if (!Number.isFinite(days)) return "current";
  if (days < 0) return "expired";
  if (days <= dueSoonDays) return "due_soon";
  return "current";
}

export function computeServiceDue(
  input: ServiceInput,
  now = Date.now(),
): ServiceDueState {
  const nextServiceDueDate =
    input.nextServiceDueDate ??
    (input.serviceIntervalMonths && input.lastServiceDate
      ? addMonths(input.lastServiceDate, input.serviceIntervalMonths)
      : undefined);
  const nextServiceDueOdometer =
    input.nextServiceDueOdometer ??
    (input.serviceIntervalKm !== undefined &&
    input.lastServiceOdometer !== undefined
      ? input.lastServiceOdometer + input.serviceIntervalKm
      : undefined);
  const nextServiceDueEngineHours =
    input.nextServiceDueEngineHours ??
    (input.serviceIntervalEngineHours !== undefined &&
    input.lastServiceEngineHours !== undefined
      ? input.lastServiceEngineHours + input.serviceIntervalEngineHours
      : undefined);

  const days = daysUntil(nextServiceDueDate, now);
  const distanceUntilNextService =
    nextServiceDueOdometer !== undefined && input.currentOdometer !== undefined
      ? nextServiceDueOdometer - input.currentOdometer
      : undefined;
  const engineHoursUntilNextService =
    nextServiceDueEngineHours !== undefined &&
    input.currentEngineHours !== undefined
      ? nextServiceDueEngineHours - input.currentEngineHours
      : undefined;

  const dueByDate = Number.isFinite(days) && days < 0;
  const dueByOdometer =
    distanceUntilNextService !== undefined && distanceUntilNextService <= 0;
  const dueByEngineHours =
    engineHoursUntilNextService !== undefined &&
    engineHoursUntilNextService <= 0;

  const reasons: string[] = [];
  if (dueByDate) reasons.push("Service date is overdue");
  if (dueByOdometer) reasons.push("Service odometer is overdue");
  if (dueByEngineHours) reasons.push("Service engine hours are overdue");

  let state: DueState = "ok";
  if (reasons.length > 0) {
    state = "overdue";
  } else if (
    (Number.isFinite(days) && days <= 30) ||
    (distanceUntilNextService !== undefined &&
      distanceUntilNextService <= 1000) ||
    (engineHoursUntilNextService !== undefined &&
      engineHoursUntilNextService <= 25)
  ) {
    state = "due_soon";
  }

  return {
    state,
    dueByDate,
    dueByOdometer,
    dueByEngineHours,
    nextServiceDueDate,
    nextServiceDueOdometer,
    nextServiceDueEngineHours,
    daysUntilNextService: Number.isFinite(days) ? days : undefined,
    distanceUntilNextService,
    engineHoursUntilNextService,
    reasons,
  };
}

export function timeRangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

export function driverApprovedForVehicle(
  approvedVehicleTypes: string[],
  vehicleType: string | undefined,
): boolean {
  if (!vehicleType || approvedVehicleTypes.length === 0) return true;
  return approvedVehicleTypes
    .map((value) => value.toLowerCase().trim())
    .includes(vehicleType.toLowerCase().trim());
}

export function criticalDefectRequiresUnavailable(
  severity: string,
  safeToOperate: boolean,
): boolean {
  return severity === "critical" || !safeToOperate;
}

export function aggregateCosts<T extends { amount: number; key?: string }>(
  rows: T[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = row.key ?? "unassigned";
    out[key] = (out[key] ?? 0) + row.amount;
  }
  return out;
}
