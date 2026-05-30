import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";

export function SoccerSettingsTab() {
  const { org, can } = useGatherHub();
  const setMode = useMutation(api.soccer.setSoccerMode);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const canToggle = can("admin");

  async function toggle(next: boolean) {
    setError(null);
    setBusy(true);
    try {
      await setMode({ enabled: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        <header className="px-5 py-3 border-b border-hairline">
          <h2 className="text-title text-ink-strong">Soccer club mode</h2>
          <p className="text-caption text-ink-quiet mt-0.5">
            Unlocks Registrations, Grading, kit metadata on teams, and the
            soccer settings below.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              checked={Boolean(org?.soccerMode)}
              onChange={(e) => toggle(e.target.checked)}
              disabled={!canToggle || busy}
              className="h-4 w-4 accent-primary"
            />
            <span className="font-semi">
              {org?.soccerMode ? "Enabled" : "Disabled"}
            </span>
          </label>
          {!canToggle && (
            <p className="text-caption text-ink-quiet">
              Owner or admin can toggle this.
            </p>
          )}
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
      </section>

      {org?.soccerMode && (
        <>
          <SkillRubricEditor />
          <DivisionEditor />
          <CompetitionEditor />
        </>
      )}
    </div>
  );
}

function SkillRubricEditor() {
  const skills = useQuery(api.soccer.listSkills, { includeInactive: true });
  const create = useMutation(api.soccer.createSkill);
  const update = useMutation(api.soccer.updateSkill);
  const [newName, setNewName] = React.useState("");
  const [newWeight, setNewWeight] = React.useState("0.1");
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create({
        name: newName.trim(),
        weight: Number(newWeight),
        maxScore: 10,
      });
      setNewName("");
      setNewWeight("0.1");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (skills === undefined) return <LoadingState />;
  const total = skills
    .filter((s) => s.active)
    .reduce((s, r) => s + r.weight, 0);

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-hairline">
        <div>
          <h2 className="text-title text-ink-strong">Skill rubric</h2>
          <p className="text-caption text-ink-quiet mt-0.5">
            Weights determine how much each skill contributes to the overall
            grade. Active weights sum to{" "}
            <span data-numeric className="font-medium text-ink-soft">
              {total.toFixed(2)}
            </span>
            .
          </p>
        </div>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Skill</TableHead>
            <TableHead numeric>Weight</TableHead>
            <TableHead numeric>Max score</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skills.map((s) => (
            <SkillRow key={s._id} skill={s} update={update} />
          ))}
        </TableBody>
      </Table>
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2 px-5 py-3 border-t border-hairline bg-surface-sunk/30"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="sk-name">New skill</Label>
          <Input
            id="sk-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Goalkeeping"
            className="max-w-xs"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sk-weight">Weight</Label>
          <Input
            id="sk-weight"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            className="w-24"
          />
        </div>
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="h-4 w-4" /> Add skill
        </Button>
        {error && <p className="text-caption text-danger">{error}</p>}
      </form>
    </section>
  );
}

interface SkillRowSkill {
  _id: Id<"soccerSkills">;
  name: string;
  description?: string;
  weight: number;
  maxScore: number;
  active: boolean;
}

function SkillRow({
  skill,
  update,
}: {
  skill: SkillRowSkill;
  update: ReturnType<typeof useMutation<typeof api.soccer.updateSkill>>;
}) {
  const [name, setName] = React.useState(skill.name);
  const [weight, setWeight] = React.useState(String(skill.weight));

  React.useEffect(() => setName(skill.name), [skill.name]);
  React.useEffect(() => setWeight(String(skill.weight)), [skill.weight]);

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== skill.name) {
              update({ id: skill._id, name: name.trim() });
            }
          }}
          className="max-w-[260px]"
        />
        {skill.description && (
          <p className="mt-1 text-caption text-ink-quiet max-w-prose">
            {skill.description}
          </p>
        )}
      </TableCell>
      <TableCell numeric>
        <Input
          type="number"
          step="0.05"
          min="0"
          max="1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => {
            const n = Number(weight);
            if (!Number.isNaN(n) && n !== skill.weight) {
              update({ id: skill._id, weight: n });
            }
          }}
          className="w-24"
        />
      </TableCell>
      <TableCell numeric>{skill.maxScore}</TableCell>
      <TableCell>
        <label className="inline-flex items-center gap-2 text-body text-ink-soft">
          <input
            type="checkbox"
            checked={skill.active}
            onChange={(e) =>
              update({ id: skill._id, active: e.target.checked })
            }
            className="h-4 w-4 accent-primary"
          />
        </label>
      </TableCell>
    </TableRow>
  );
}

function DivisionEditor() {
  const divisions = useQuery(api.soccer.listDivisions, {});
  const upsert = useMutation(api.soccer.upsertDivision);
  const [name, setName] = React.useState("");
  const [min, setMin] = React.useState("");
  const [max, setMax] = React.useState("");
  const [color, setColor] = React.useState("#0891b2");
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await upsert({
        name: name.trim(),
        minGrade: Number(min),
        maxGrade: Number(max),
        color,
      });
      setName("");
      setMin("");
      setMax("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (divisions === undefined) return <LoadingState />;

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="px-5 py-3 border-b border-hairline">
        <h2 className="text-title text-ink-strong">Divisions</h2>
        <p className="text-caption text-ink-quiet mt-0.5">
          Players are auto-matched to the division whose grade band contains
          their overall score. Bands may overlap; the first match wins.
        </p>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead numeric>Min</TableHead>
            <TableHead numeric>Max</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {divisions.map((d) => (
            <TableRow key={d._id}>
              <TableCell className="font-semi text-ink-strong">
                {d.name}
              </TableCell>
              <TableCell numeric>{d.minGrade}</TableCell>
              <TableCell numeric>{d.maxGrade}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 rounded-xs border border-hairline"
                    style={{ background: d.color ?? "transparent" }}
                  />
                  <code className="text-mono text-ink-quiet">
                    {d.color ?? "—"}
                  </code>
                </span>
              </TableCell>
              <TableCell>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.active}
                    onChange={(e) =>
                      upsert({
                        id: d._id,
                        name: d.name,
                        minGrade: d.minGrade,
                        maxGrade: d.maxGrade,
                        color: d.color,
                        active: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form
        onSubmit={add}
        className="grid sm:grid-cols-[1fr_auto_auto_auto_auto] items-end gap-2 px-5 py-3 border-t border-hairline bg-surface-sunk/30"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="dv-name">Division name</Label>
          <Input
            id="dv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-min">Min</Label>
          <Input
            id="dv-min"
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="w-20"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-max">Max</Label>
          <Input
            id="dv-max"
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="w-20"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-color">Color</Label>
          <Input
            id="dv-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-12 p-1"
          />
        </div>
        <Button type="submit" disabled={!name.trim() || !min || !max}>
          <Plus className="h-4 w-4" /> Add
        </Button>
        {error && (
          <p className="sm:col-span-5 text-caption text-danger">{error}</p>
        )}
      </form>
    </section>
  );
}

function CompetitionEditor() {
  const comps = useQuery(api.soccer.listCompetitions, {});
  const upsert = useMutation(api.soccer.upsertCompetition);
  const [name, setName] = React.useState("");
  const [season, setSeason] = React.useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await upsert({
      name: name.trim(),
      season: season.trim() || undefined,
    });
    setName("");
    setSeason("");
  }

  if (comps === undefined) return <LoadingState />;

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="px-5 py-3 border-b border-hairline">
        <h2 className="text-title text-ink-strong">Competitions</h2>
        <p className="text-caption text-ink-quiet mt-0.5">
          Optional grouping for registrations (league name, cup, season).
        </p>
      </header>
      {comps.length === 0 ? (
        <p className="px-5 py-6 text-body text-ink-quiet">
          No competitions yet.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {comps.map((c) => (
            <li
              key={c._id}
              className="flex flex-wrap items-center gap-3 px-5 py-2.5"
            >
              <span className="text-body-strong text-ink-strong">{c.name}</span>
              {c.season && <Badge variant="muted">{c.season}</Badge>}
              <span className="ml-auto">
                <label className="inline-flex items-center gap-2 text-caption text-ink-soft">
                  <input
                    type="checkbox"
                    checked={c.active}
                    onChange={(e) =>
                      upsert({
                        id: c._id,
                        name: c.name,
                        season: c.season,
                        active: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  Active
                </label>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2 px-5 py-3 border-t border-hairline bg-surface-sunk/30"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="cp-name">Competition name</Label>
          <Input
            id="cp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cp-season">Season</Label>
          <Input
            id="cp-season"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="e.g. 2026"
            className="w-32"
          />
        </div>
        <Button type="submit" disabled={!name.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
    </section>
  );
}
