import { Badge } from "@/components/ui/badge";
import { humanise } from "@/lib/utils";
import { DESTRUCTIVE_DISCREPANCY_FLAGS, wasteStatusVariant } from "./constants";

export function StatusBadge({ value }: { value?: string }) {
  return (
    <Badge variant={wasteStatusVariant(value)}>
      {humanise(value ?? "unknown")}
    </Badge>
  );
}

export function DiscrepancyBadges({
  flags,
}: {
  flags: string[] | null | undefined;
}) {
  if (!flags || flags.length === 0) {
    return <span className="text-caption text-ink-quiet">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <Badge
          key={flag}
          variant={
            DESTRUCTIVE_DISCREPANCY_FLAGS.has(flag) ? "destructive" : "warning"
          }
        >
          {humanise(flag)}
        </Badge>
      ))}
    </div>
  );
}
