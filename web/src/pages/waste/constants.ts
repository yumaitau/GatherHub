import { humanise } from "@/lib/utils";

export const WASTE_UNITS = [
  "kg",
  "tonne",
  "litre",
  "cubic_metre",
  "bin",
  "skip",
  "each",
] as const;

export const WASTE_CLASSIFICATIONS = [
  "general",
  "recycling",
  "organic",
  "construction",
  "liquid",
  "hazardous",
  "clinical",
  "e_waste",
  "other",
] as const;

export type WasteBadgeVariant = "muted" | "warning" | "success" | "destructive";

// Map a load/event status to a badge tone consistent with the fleet vertical.
export function wasteStatusVariant(
  value: string | undefined,
): WasteBadgeVariant {
  switch (value) {
    case "rejected":
    case "cancelled":
      return "destructive";
    case "picked_up":
    case "in_transit":
    case "arrived":
    case "redirected":
      return "warning";
    case "accepted":
    case "processed":
      return "success";
    default:
      return "muted";
  }
}

// Flags that signal a hard failure read as destructive; the rest are warnings.
export const DESTRUCTIVE_DISCREPANCY_FLAGS = new Set([
  "rejected_load",
  "wrong_party",
]);

export function qtyLabel(
  amount: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (amount == null) return "-";
  return `${amount} ${unit ? humanise(unit) : ""}`.trim();
}
