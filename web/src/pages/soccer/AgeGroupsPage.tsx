import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import {
  Plus,
  Layers3,
  Pencil,
  ArrowUp,
  ArrowDown,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import {
  legacySoccerSurfacesEnabled,
  sportSectionLabel,
  term,
  titleCase,
} from "@/lib/verticals";

export default function AgeGroupsPage() {
  const { org, hasCapability } = useGatherHub();
  const rows = useQuery(api.taxonomies.list, {
    kind: "team_age_group",
    includeInactive: true,
  });
  const reorder = useMutation(api.taxonomies.reorder);
  const setActive = useMutation(api.taxonomies.setActive);
  const canEdit = hasCapability("soccer.manage");
  const ageGroupPlural = titleCase(term(org, "ageGroupPlural"));
  const sportName = sportSectionLabel(org);

  if (!legacySoccerSurfacesEnabled(org)) {
    return (
      <EmptyState
        icon={Layers3}
        title={`${sportName} pack is off`}
        description={`Enable the sport pack in Settings to manage ${ageGroupPlural.toLowerCase()}.`}
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  const active = (rows ?? []).filter((r) => r.active);
  const hidden = (rows ?? []).filter((r) => !r.active);
  const count = active.length;

  async function move(id: Id<"taxonomies">, direction: -1 | 1) {
    const idx = active.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const next = idx + direction;
    if (next < 0 || next >= active.length) return;
    const reordered = [...active];
    const [m] = reordered.splice(idx, 1);
    if (!m) return;
    reordered.splice(next, 0, m);
    await reorder({
      kind: "team_age_group",
      orderedIds: [...reordered, ...hidden].map((r) => r.id),
    });
  }

  async function toggleActive(id: Id<"taxonomies">, active: boolean) {
    try {
      await setActive({ id, active });
      toastSuccess(active ? "Age group restored." : "Age group hidden.");
    } catch (err) {
      toastFailure(err, "Could not update age group.");
    }
  }

  return (
    <div>
      <PageHeader
        title={`${ageGroupPlural} (${count})`}
        description="Age groups available when creating a team or registration."
        actions={canEdit && <AgeGroupDialog />}
      />
      {rows === undefined ? (
        <LoadingState />
      ) : active.length === 0 && hidden.length === 0 ? (
        <EmptyState
          icon={Layers3}
          title="No age groups yet"
          description="Add the first age group (e.g. U8)."
          action={canEdit && <AgeGroupDialog />}
        />
      ) : (
        <section className="rounded-md border border-hairline bg-surface overflow-hidden">
          <ul className="divide-y divide-hairline">
            {active.map((r, idx) => (
              <li
                key={String(r.id)}
                className="flex items-center gap-3 px-5 py-2.5"
              >
                <span className="font-semi text-ink-strong">{r.label}</span>
                <code className="text-mono text-ink-quiet">{r.key}</code>
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => move(r.id, -1)}
                      title="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === active.length - 1}
                      onClick={() => move(r.id, 1)}
                      title="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(r.id, false)}
                      title="Hide"
                    >
                      <EyeOff className="h-4 w-4" /> Hide
                    </Button>
                    <AgeGroupDialog existing={r} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {hidden.length > 0 && (
            <div className="px-5 py-3 border-t border-hairline bg-surface-sunk/30">
              <p className="text-label text-ink-quiet mb-2">
                Hidden ({hidden.length})
              </p>
              <ul className="flex flex-wrap gap-2">
                {hidden.map((r) => (
                  <li
                    key={String(r.id)}
                    className="inline-flex items-center gap-1 rounded-sm bg-surface px-2 py-1"
                  >
                    <Badge variant="muted">{r.label}</Badge>
                    {canEdit && (
                      <>
                        <AgeGroupDialog existing={r} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(r.id, true)}
                        >
                          <RotateCcw className="h-4 w-4" /> Restore
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface ExistingTaxonomy {
  id: Id<"taxonomies">;
  label: string;
}

function AgeGroupDialog({ existing }: { existing?: ExistingTaxonomy }) {
  const create = useMutation(api.taxonomies.create);
  const update = useMutation(api.taxonomies.update);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(existing?.label ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setLabel(existing?.label ?? "");
      setError(null);
    }
  }, [open, existing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await update({ id: existing.id, label: label.trim() });
      } else {
        await create({ kind: "team_age_group", label: label.trim() });
      }
      setOpen(false);
      if (!existing) setLabel("");
      toastSuccess(existing ? "Age group updated." : "Age group added.");
    } catch (err) {
      setError(toastFailure(err, "Could not save age group."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" /> New age group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit age group" : "New age group"}
          </DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ag-label">Label</Label>
            <Input
              id="ag-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. U12"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form={formId}
            disabled={saving || !label.trim()}
          >
            {saving ? "Saving…" : existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
