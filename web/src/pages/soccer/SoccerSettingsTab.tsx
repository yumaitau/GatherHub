import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, RotateCcw, Calculator } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toastFailure, toastSuccess } from "@/lib/feedback";

const DEFAULT_DIVISION_COLOR = "#0891b2";

export function SoccerSettingsTab() {
  const { org, can } = useGatherHub();
  const setMode = useMutation(api.soccer.setSoccerMode);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const canToggle = can("committee");

  async function toggle(next: boolean) {
    setError(null);
    setBusy(true);
    try {
      await setMode({ enabled: next });
      toastSuccess(next ? "Soccer mode enabled." : "Soccer mode disabled.");
    } catch (err) {
      setError(toastFailure(err, "Could not update soccer mode."));
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
              Committee members and above can toggle this.
            </p>
          )}
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
      </section>

      {org?.soccerMode && (
        <>
          <GradingExplainer />
          <SkillRubricEditor />
          <DivisionEditor />
          <CompetitionEditor />
        </>
      )}
    </div>
  );
}

function GradingExplainer() {
  const restore = useMutation(api.soccer.restoreGradingDefaults);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{
    skillsAdded: number;
    divisionsAdded: number;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onRestore() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const r = await restore({});
      setResult(r);
      toastSuccess("Default grading setup restored.");
    } catch (err) {
      setError(toastFailure(err, "Could not restore grading defaults."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-primary-wash/40 overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-hairline">
        <Calculator
          className="h-4 w-4 text-primary shrink-0"
          aria-hidden="true"
        />
        <h2 className="text-title text-ink-strong">How grading works</h2>
      </header>
      <div className="px-5 py-4 grid gap-3 text-body text-ink">
        <p className="max-w-prose">
          Each player is scored against the rubric below. Their overall grade is
          a weighted average: every scored skill contributes{" "}
          <code className="text-mono text-ink-strong">
            (score ÷ maxScore) × weight × 100
          </code>
          , summed and divided by the total weight of the skills that were
          actually scored. Unrated skills don't drag the grade down — they're
          excluded from both sides of the average.
        </p>
        <p className="max-w-prose text-ink-soft">
          The resulting grade (0–100) is matched to a division using the bands
          you configure. Bands may overlap; the first match in display order
          wins.
        </p>
        <p className="text-caption text-ink-quiet max-w-prose">
          Defaults mirror the Belwest grading system: seven skills (Ball
          Handling, Passing, Shooting, Defense, Speed &amp; Agility, Physical
          Strength, Game Intelligence) and five divisions in 15-point bands. You
          can rename, reweight, deactivate, or add to any of these — your
          customisations are never overwritten.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="outline"
            onClick={onRestore}
            disabled={busy}
            title="Add any missing default skills or divisions. Existing customisations are kept."
          >
            <RotateCcw className="h-4 w-4" />
            {busy ? "Restoring…" : "Restore default skills + divisions"}
          </Button>
          {result && (
            <p className="text-caption text-ink-soft">
              Added <span data-numeric>{result.skillsAdded}</span> skill
              {result.skillsAdded === 1 ? "" : "s"} and{" "}
              <span data-numeric>{result.divisionsAdded}</span> division
              {result.divisionsAdded === 1 ? "" : "s"}.
            </p>
          )}
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
      </div>
    </section>
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
      toastSuccess("Skill added.");
    } catch (err) {
      setError(toastFailure(err, "Could not add skill."));
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
      toastSuccess("Division added.");
    } catch (err) {
      setError(toastFailure(err, "Could not add division."));
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
            <DivisionSettingsRow key={d._id} division={d} upsert={upsert} />
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

interface DivisionSettingsDivision {
  _id: Id<"soccerDivisions">;
  name: string;
  minGrade: number;
  maxGrade: number;
  color?: string;
  active: boolean;
}

function DivisionSettingsRow({
  division,
  upsert,
}: {
  division: DivisionSettingsDivision;
  upsert: ReturnType<typeof useMutation<typeof api.soccer.upsertDivision>>;
}) {
  const [name, setName] = React.useState(division.name);
  const [min, setMin] = React.useState(String(division.minGrade));
  const [max, setMax] = React.useState(String(division.maxGrade));
  const [color, setColor] = React.useState(
    division.color ?? DEFAULT_DIVISION_COLOR,
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setName(division.name), [division.name]);
  React.useEffect(() => setMin(String(division.minGrade)), [division.minGrade]);
  React.useEffect(() => setMax(String(division.maxGrade)), [division.maxGrade]);
  React.useEffect(
    () => setColor(division.color ?? DEFAULT_DIVISION_COLOR),
    [division.color],
  );

  async function save(patch: Partial<DivisionSettingsDivision>) {
    const nextName = (patch.name ?? name).trim();
    const nextMin =
      patch.minGrade ?? (Number.isFinite(Number(min)) ? Number(min) : NaN);
    const nextMax =
      patch.maxGrade ?? (Number.isFinite(Number(max)) ? Number(max) : NaN);
    const nextColor = patch.color ?? color;
    const nextActive = patch.active ?? division.active;
    setError(null);

    try {
      if (!nextName) throw new Error("Division name is required.");
      if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax)) {
        throw new Error("Enter numeric grade limits.");
      }
      if (nextMin > nextMax) {
        throw new Error("Min grade must be at or below max grade.");
      }
      await upsert({
        id: division._id,
        name: nextName,
        minGrade: nextMin,
        maxGrade: nextMax,
        color: nextColor.trim() || undefined,
        active: nextActive,
      });
      toastSuccess("Division updated.");
    } catch (err) {
      setError(toastFailure(err, "Could not update division."));
    }
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (next && next !== division.name) void save({ name: next });
          }}
          className="max-w-[220px]"
        />
        {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      </TableCell>
      <TableCell numeric>
        <Input
          type="number"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => {
            const next = Number(min);
            if (Number.isFinite(next) && next !== division.minGrade) {
              void save({ minGrade: next });
            }
          }}
          className="w-24"
        />
      </TableCell>
      <TableCell numeric>
        <Input
          type="number"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => {
            const next = Number(max);
            if (Number.isFinite(next) && next !== division.maxGrade) {
              void save({ maxGrade: next });
            }
          }}
          className="w-24"
        />
      </TableCell>
      <TableCell>
        <Input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          onBlur={() => {
            if (color !== (division.color ?? DEFAULT_DIVISION_COLOR)) {
              void save({ color });
            }
          }}
          className="h-9 w-14 p-1"
        />
      </TableCell>
      <TableCell>
        <label className="inline-flex items-center gap-2 text-caption text-ink-soft">
          <input
            type="checkbox"
            checked={division.active}
            onChange={(e) => void save({ active: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Active
        </label>
      </TableCell>
    </TableRow>
  );
}

function CompetitionEditor() {
  const comps = useQuery(api.soccer.listCompetitions, {});
  const upsert = useMutation(api.soccer.upsertCompetition);
  const [name, setName] = React.useState("");
  const [season, setSeason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await upsert({
        name: name.trim(),
        season: season.trim() || undefined,
      });
      setName("");
      setSeason("");
      toastSuccess("Competition added.");
    } catch (err) {
      setError(toastFailure(err, "Could not add competition."));
    }
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Season</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comps.map((c) => (
              <CompetitionSettingsRow
                key={c._id}
                competition={c}
                upsert={upsert}
              />
            ))}
          </TableBody>
        </Table>
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
        {error && <p className="text-caption text-danger">{error}</p>}
      </form>
    </section>
  );
}

interface CompetitionSettingsCompetition {
  _id: Id<"soccerCompetitions">;
  name: string;
  season?: string;
  active: boolean;
}

function CompetitionSettingsRow({
  competition,
  upsert,
}: {
  competition: CompetitionSettingsCompetition;
  upsert: ReturnType<typeof useMutation<typeof api.soccer.upsertCompetition>>;
}) {
  const [name, setName] = React.useState(competition.name);
  const [season, setSeason] = React.useState(competition.season ?? "");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setName(competition.name), [competition.name]);
  React.useEffect(
    () => setSeason(competition.season ?? ""),
    [competition.season],
  );

  async function save(patch: Partial<CompetitionSettingsCompetition>) {
    const nextName = (patch.name ?? name).trim();
    const nextSeason =
      patch.season !== undefined ? patch.season : season.trim() || undefined;
    const nextActive = patch.active ?? competition.active;
    setError(null);

    try {
      if (!nextName) throw new Error("Competition name is required.");
      await upsert({
        id: competition._id,
        name: nextName,
        season: nextSeason,
        active: nextActive,
      });
      toastSuccess("Competition updated.");
    } catch (err) {
      setError(toastFailure(err, "Could not update competition."));
    }
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (next && next !== competition.name) void save({ name: next });
          }}
          className="max-w-[260px]"
        />
        {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      </TableCell>
      <TableCell>
        <Input
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          onBlur={() => {
            const next = season.trim();
            if (next !== (competition.season ?? "")) {
              void save({ season: next || undefined });
            }
          }}
          placeholder="e.g. 2026"
          className="w-32"
        />
      </TableCell>
      <TableCell>
        <label className="inline-flex items-center gap-2 text-caption text-ink-soft">
          <input
            type="checkbox"
            checked={competition.active}
            onChange={(e) => void save({ active: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Active
        </label>
      </TableCell>
    </TableRow>
  );
}
