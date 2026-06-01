import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { EyeOff, Layers, Pencil, Plus, RotateCcw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const DEFAULT_DIVISION_COLOR = "#0891b2";

type DivisionRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.soccer.divisionRoster>>
>[number];

export default function SoccerDivisionsPage() {
  const { org, can } = useGatherHub();
  const divisions = useQuery(api.soccer.divisionRoster, {});
  const upsert = useMutation(api.soccer.upsertDivision);
  const canEdit = can("committee");

  async function setDivisionActive(division: DivisionRow, active: boolean) {
    try {
      await upsert({
        id: division.id as Id<"soccerDivisions">,
        name: division.name,
        minGrade: division.minGrade,
        maxGrade: division.maxGrade,
        color: division.color ?? undefined,
        active,
      });
      toastSuccess(active ? "Division restored." : "Division hidden.");
    } catch (err) {
      toastFailure(err, "Could not update division.");
    }
  }

  if (!org?.soccerMode) {
    return (
      <EmptyState
        icon={Layers}
        title="Soccer mode is off"
        description="Enable Soccer club mode in Settings to use divisions."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Divisions"
        description="Create and edit the grade bands used for registration and grading."
        actions={canEdit && <DivisionDialog />}
      />
      {divisions === undefined ? (
        <LoadingState />
      ) : divisions.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No divisions yet"
          description="Add grade bands to start assigning players."
          action={canEdit && <DivisionDialog />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {divisions.map((d) => (
            <section
              key={d.id}
              className="flex min-h-[220px] flex-col rounded-md border border-hairline bg-surface overflow-hidden"
            >
              <header className="flex flex-col gap-3 px-5 py-3 border-b border-hairline sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 inline-block h-4 w-4 shrink-0 rounded-xs border border-hairline"
                    style={{ background: d.color ?? "transparent" }}
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-title text-ink-strong">
                      {d.name}
                    </h2>
                    <p className="text-caption text-ink-quiet">
                      Grade <span data-numeric>{d.minGrade}</span>
                      {"-"}
                      <span data-numeric>{d.maxGrade}</span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!d.active && <Badge variant="muted">Hidden</Badge>}
                  {canEdit && (
                    <>
                      <DivisionDialog existing={d} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDivisionActive(d, !d.active)}
                      >
                        {d.active ? (
                          <>
                            <EyeOff className="h-4 w-4" /> Hide
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-4 w-4" /> Restore
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </header>
              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-body text-ink-soft">
                  <span
                    data-numeric
                    className="font-strong text-ink-strong text-headline"
                  >
                    {d.memberCount}
                  </span>{" "}
                  {d.memberCount === 1 ? "player" : "players"}
                </span>
              </div>
              {d.members.length > 0 && (
                <ul className="divide-y divide-hairline">
                  {d.members.slice(0, 12).map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/members/${m.id}`}
                        className="block px-5 py-2 text-body text-ink hover:bg-surface-sunk/50 hover:text-primary"
                      >
                        {m.name}
                      </Link>
                    </li>
                  ))}
                  {d.members.length > 12 && (
                    <li className="px-5 py-2 text-caption text-ink-quiet">
                      + {d.members.length - 12} more
                    </li>
                  )}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function DivisionDialog({ existing }: { existing?: DivisionRow }) {
  const upsert = useMutation(api.soccer.upsertDivision);
  const formId = React.useId();
  const nameId = `${formId}-name`;
  const minId = `${formId}-min`;
  const maxId = `${formId}-max`;
  const colorId = `${formId}-color`;
  const activeId = `${formId}-active`;
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(existing?.name ?? "");
  const [minGrade, setMinGrade] = React.useState(
    existing ? String(existing.minGrade) : "",
  );
  const [maxGrade, setMaxGrade] = React.useState(
    existing ? String(existing.maxGrade) : "",
  );
  const [color, setColor] = React.useState(
    existing?.color ?? DEFAULT_DIVISION_COLOR,
  );
  const [active, setActive] = React.useState(existing?.active ?? true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setMinGrade(existing ? String(existing.minGrade) : "");
    setMaxGrade(existing ? String(existing.maxGrade) : "");
    setColor(existing?.color ?? DEFAULT_DIVISION_COLOR);
    setActive(existing?.active ?? true);
    setError(null);
  }, [open, existing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const minValue = Number(minGrade);
      const maxValue = Number(maxGrade);
      if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        throw new Error("Enter numeric grade limits.");
      }
      if (minValue > maxValue) {
        throw new Error("Min grade must be at or below max grade.");
      }
      await upsert({
        id: existing?.id as Id<"soccerDivisions"> | undefined,
        name: name.trim(),
        minGrade: minValue,
        maxGrade: maxValue,
        color: color.trim() || undefined,
        active,
      });
      setOpen(false);
      if (!existing) {
        setName("");
        setMinGrade("");
        setMaxGrade("");
        setColor(DEFAULT_DIVISION_COLOR);
        setActive(true);
      }
      toastSuccess(existing ? "Division updated." : "Division added.");
    } catch (err) {
      setError(toastFailure(err, "Could not save division."));
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
            <Plus className="h-4 w-4" /> New division
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit division" : "New division"}
          </DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={minId}>Min grade</Label>
              <Input
                id={minId}
                type="number"
                value={minGrade}
                onChange={(e) => setMinGrade(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={maxId}>Max grade</Label>
              <Input
                id={maxId}
                type="number"
                value={maxGrade}
                onChange={(e) => setMaxGrade(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={colorId}>Color</Label>
            <Input
              id={colorId}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-16 p-1"
            />
          </div>
          <label
            htmlFor={activeId}
            className="inline-flex items-center gap-2 text-body text-ink-soft"
          >
            <input
              id={activeId}
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Active
          </label>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form={formId}
            disabled={
              saving || !name.trim() || !minGrade.trim() || !maxGrade.trim()
            }
          >
            {saving ? "Saving..." : existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
