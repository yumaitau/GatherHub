import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { humanise } from "@/lib/utils";

type Scope = "category" | "assetType";
type Kind = "text" | "number" | "date" | "select" | "boolean";

const ASSET_TYPES = [
  "vehicle",
  "trailer",
  "plant",
  "equipment",
  "bin",
  "container",
  "tool",
  "device",
  "other",
];
const KINDS: Kind[] = ["text", "number", "date", "select", "boolean"];

type Def = {
  _id: Id<"assetFieldDefs">;
  scope: Scope;
  scopeKey: string;
  key: string;
  label: string;
  kind: Kind;
  options?: string[];
  unit?: string;
  required: boolean;
  active: boolean;
};

export default function AssetFieldsPage() {
  const { hasCapability } = useGatherHub();
  const canManage = hasCapability("assets.admin");
  const defs = useQuery(api.assetFields.listDefs, {}) as Def[] | undefined;

  if (!canManage) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Admins only"
        description="You need asset administration to manage custom fields."
        action={
          <Button asChild>
            <Link to="/settings">Back to settings</Link>
          </Button>
        }
      />
    );
  }

  // Group by scope + scopeKey for display.
  const groups = new Map<string, Def[]>();
  for (const d of defs ?? []) {
    const k = `${d.scope}:${d.scopeKey}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }

  return (
    <div>
      <PageHeader
        title="Asset custom fields"
        description="Define extra fields per asset category or fleet type (e.g. Truck → GVM, axles; plant → engine hours). They appear on matching asset detail screens."
        actions={<DefDialog />}
      />

      {defs === undefined ? (
        <LoadingState />
      ) : defs.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No custom fields yet"
          description="Add a field bound to a category or fleet type."
          action={<DefDialog />}
        />
      ) : (
        <div className="grid gap-5">
          {[...groups.entries()].map(([k, rows]) => {
            const [scope, scopeKey] = k.split(":");
            return (
              <section key={k}>
                <h2 className="mb-2 flex items-center gap-2 text-body-strong text-ink-strong">
                  <Badge variant="muted">
                    {scope === "category" ? "Category" : "Fleet type"}
                  </Badge>
                  {humanise(scopeKey ?? "")}
                </h2>
                <div className="grid gap-2">
                  {rows.map((d) => (
                    <div
                      key={d._id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-hairline bg-surface px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body-strong text-ink-strong">
                          {d.label}
                        </span>
                        <Badge variant="muted">{d.kind}</Badge>
                        {d.unit && (
                          <span className="text-caption text-ink-quiet">
                            {d.unit}
                          </span>
                        )}
                        {d.required && <Badge variant="info">Required</Badge>}
                        {!d.active && <Badge variant="muted">Hidden</Badge>}
                        {d.kind === "select" && d.options && (
                          <span className="text-caption text-ink-quiet">
                            {d.options.join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <DefDialog def={d} />
                        <RemoveDefButton defId={d._id} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DefDialog({ def }: { def?: Def }) {
  const upsert = useMutation(api.assetFields.upsertDef);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    scope: (def?.scope ?? "category") as Scope,
    scopeKey: def?.scopeKey ?? "",
    label: def?.label ?? "",
    kind: (def?.kind ?? "text") as Kind,
    options: (def?.options ?? []).join(", "),
    unit: def?.unit ?? "",
    required: def?.required ?? false,
    active: def?.active ?? true,
  });
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.scopeKey.trim()) return;
    setSaving(true);
    try {
      await upsert({
        defId: def?._id,
        scope: form.scope,
        scopeKey: form.scopeKey.trim(),
        label: form.label.trim(),
        kind: form.kind,
        options:
          form.kind === "select"
            ? form.options
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean)
            : undefined,
        unit:
          form.kind === "number" ? form.unit.trim() || undefined : undefined,
        required: form.required,
        active: form.active,
      });
      toastSuccess("Field saved.");
      setOpen(false);
    } catch (err) {
      toastFailure(err, "Could not save field.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {def ? (
          <Button variant="ghost" size="sm" aria-label="Edit field">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" />
            Add field
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{def ? "Edit field" : "Add field"}</DialogTitle>
          <DialogDescription>
            Bind a field to a category or fleet type.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Applies to">
              <Select
                value={form.scope}
                onValueChange={(v) => set("scope", v as Scope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="assetType">Fleet type</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={form.scope === "category" ? "Category" : "Fleet type"}
            >
              {form.scope === "assetType" ? (
                <Select
                  value={form.scopeKey || "vehicle"}
                  onValueChange={(v) => set("scopeKey", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {humanise(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.scopeKey}
                  placeholder="e.g. Truck"
                  onChange={(e) => set("scopeKey", e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Label">
            <Input
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={form.kind}
                onValueChange={(v) => set("kind", v as Kind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {humanise(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.kind === "number" && (
              <Field label="Unit">
                <Input
                  value={form.unit}
                  placeholder="e.g. km, hrs"
                  onChange={(e) => set("unit", e.target.value)}
                />
              </Field>
            )}
          </div>
          {form.kind === "select" && (
            <Field label="Options (comma separated)">
              <Input
                value={form.options}
                placeholder="diesel, petrol, electric"
                onChange={(e) => set("options", e.target.value)}
              />
            </Field>
          )}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-body text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={form.required}
                onChange={(e) => set("required", e.target.checked)}
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-body text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={saving || !form.label.trim() || !form.scopeKey.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDefButton({ defId }: { defId: Id<"assetFieldDefs"> }) {
  const remove = useMutation(api.assetFields.removeDef);
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Delete field"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Delete this field? Stored values are kept."))
          return;
        setBusy(true);
        try {
          await remove({ defId });
        } catch (err) {
          toastFailure(err, "Could not delete field.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-caption text-ink-quiet">{label}</Label>
      {children}
    </div>
  );
}
