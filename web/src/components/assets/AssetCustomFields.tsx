import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toastFailure, toastSuccess } from "@/lib/feedback";

type Attribute = { key: string; value: string };

/**
 * Renders an asset's org-defined custom fields (resolved from its category +
 * fleet type) as an editable card. Empty when no fields are defined for this
 * asset's category/type.
 */
export function AssetCustomFields({
  assetId,
  category,
  assetType,
  attributes,
  canEdit,
}: {
  assetId: Id<"assets">;
  category?: string;
  assetType?: string;
  attributes?: Attribute[];
  canEdit: boolean;
}) {
  const defs = useQuery(api.assetFields.resolveForAsset, {
    category,
    assetType,
  });
  const setAttributes = useMutation(api.assetFields.setAttributes);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  // Seed local state from stored attributes whenever they change.
  React.useEffect(() => {
    const seed: Record<string, string> = {};
    for (const a of attributes ?? []) seed[a.key] = a.value;
    setValues(seed);
  }, [attributes]);

  if (defs === undefined || defs.length === 0) return null;

  const stored = new Map((attributes ?? []).map((a) => [a.key, a.value]));
  const dirty = defs.some(
    (d) => (values[d.key] ?? "") !== (stored.get(d.key) ?? ""),
  );

  async function save() {
    setSaving(true);
    try {
      await setAttributes({
        assetId,
        attributes: (defs ?? [])
          .map((d) => ({ key: d.key, value: values[d.key] ?? "" }))
          .filter((a) => a.value !== ""),
      });
      toastSuccess("Custom fields saved.");
    } catch (err) {
      toastFailure(err, "Could not save custom fields.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: string, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-body-strong text-ink-strong">Custom fields</h2>
        {canEdit && dirty && (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-md border border-hairline bg-surface px-4 py-3 sm:grid-cols-2">
        {defs.map((d) => (
          <div key={d.key} className="grid gap-1.5">
            <Label className="text-caption text-ink-quiet">
              {d.label}
              {d.required && <span className="text-danger"> *</span>}
              {d.unit ? ` (${d.unit})` : ""}
            </Label>
            <FieldInput
              def={d}
              value={values[d.key] ?? ""}
              disabled={!canEdit}
              onChange={(v) => set(d.key, v)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function FieldInput({
  def,
  value,
  disabled,
  onChange,
}: {
  def: {
    kind: "text" | "number" | "date" | "select" | "boolean";
    options?: string[];
  };
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  switch (def.kind) {
    case "number":
      return (
        <Input
          type="number"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-body text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={value === "true"}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          />
          {value === "true" ? "Yes" : "No"}
        </label>
      );
    case "select":
      return (
        <Select
          value={value || "none"}
          onValueChange={(v) => onChange(v === "none" ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {(def.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "text":
    default:
      return (
        <Input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
