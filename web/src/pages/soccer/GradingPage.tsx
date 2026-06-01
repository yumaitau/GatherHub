import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Gauge,
  Calculator,
  Settings as SettingsIcon,
} from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import {
  legacySoccerSurfacesEnabled,
  sportSectionLabel,
  term,
  titleCase,
} from "@/lib/verticals";

type RosterRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.soccer.playerRoster>>
>[number];

export default function GradingPage() {
  const { org } = useGatherHub();
  const roster = useQuery(api.soccer.playerRoster, {});
  const gradingLabel = titleCase(term(org, "gradingSingular"));
  const sportName = sportSectionLabel(org);

  if (!legacySoccerSurfacesEnabled(org)) {
    return (
      <EmptyState
        icon={Gauge}
        title={`${sportName} pack is off`}
        description="Enable the sport pack in Settings to use grading."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  const columns: ColumnDef<RosterRow>[] = [
    {
      accessorKey: "name",
      header: "Player",
      cell: ({ row }) => (
        <span className="font-semi text-ink-strong">{row.original.name}</span>
      ),
    },
    {
      accessorFn: (r) => (r.scoredCount === 0 ? -1 : r.grade),
      id: "grade",
      header: "Grade",
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.scoredCount === 0 ? (
          <span className="text-ink-quiet">—</span>
        ) : (
          <span className="font-strong text-ink-strong">
            {row.original.grade.toFixed(1)}
          </span>
        ),
    },
    {
      accessorFn: (r) => r.division?.name ?? "",
      id: "division",
      header: "Division",
      cell: ({ row }) =>
        row.original.division ? (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-xs"
              style={{
                background: row.original.division.color ?? "transparent",
              }}
            />
            {row.original.division.name}
          </span>
        ) : (
          <span className="text-ink-quiet">unassigned</span>
        ),
    },
    {
      accessorFn: (r) => r.scoredCount,
      id: "progress",
      header: "Progress",
      cell: ({ row }) => (
        <span className="text-ink-soft">
          <span data-numeric>{row.original.scoredCount}</span>
          {" / "}
          <span data-numeric>{row.original.totalSkills}</span>
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button asChild size="sm" variant="outline">
          <Link to={`/sport/grading/${row.original.memberId}`}>Evaluate</Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`${gradingLabel} (${roster?.length ?? 0})`}
        description="Score each player on the active rubric. Overall grade auto-computes and matches a division band."
        actions={
          <Button variant="outline" asChild>
            <Link to="/settings">
              <SettingsIcon className="h-4 w-4" /> Customise rubric
            </Link>
          </Button>
        }
      />
      <section className="mb-4 flex items-start gap-3 rounded-md border border-hairline bg-primary-wash/40 px-4 py-3">
        <Calculator
          className="h-4 w-4 mt-0.5 text-primary shrink-0"
          aria-hidden="true"
        />
        <p className="text-caption text-ink-soft max-w-prose">
          Grade is a weighted average of skill scores —{" "}
          <code className="text-mono text-ink-strong">
            Σ(score ÷ max × weight × 100) ÷ Σ(weight of scored skills)
          </code>
          . Unscored skills are ignored. Rubric and division bands live in{" "}
          <Link to="/settings" className="text-primary hover:underline">
            Settings → {sportName}
          </Link>
          .
        </p>
      </section>
      {roster === undefined ? (
        <LoadingState />
      ) : (
        <DataTable<RosterRow>
          data={roster}
          columns={columns}
          getRowId={(r) => String(r.memberId)}
          searchPlaceholder="Search player, division"
          emptyState={
            <EmptyState
              icon={Gauge}
              title="No active members to grade"
              description="Mark members active in Members, then return here to evaluate."
            />
          }
        />
      )}
    </div>
  );
}

export function PlayerEvaluationPage() {
  const { org } = useGatherHub();
  const { memberId } = useParams<{ memberId: string }>();
  const id = memberId as Id<"members">;
  const gradingLabel = titleCase(term(org, "gradingSingular"));
  const skills = useQuery(api.soccer.listSkills, {});
  const evals = useQuery(api.soccer.playerEvaluations, { memberId: id });
  const grade = useQuery(api.soccer.playerGrade, { memberId: id });
  const member = useQuery(
    api.members.get,
    memberId ? { memberId: id } : "skip",
  );

  if (skills === undefined || evals === undefined || grade === undefined) {
    return <LoadingState />;
  }

  const evalByskill = new Map(evals.map((e) => [e.skillId, e]));
  const active = skills.filter((s) => s.active);
  const name = member
    ? `${member.member.firstName} ${member.member.lastName}`
    : "Player";

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link to="/sport/grading">
          <ArrowLeft className="h-4 w-4" /> {gradingLabel}
        </Link>
      </Button>
      <PageHeader
        title={name}
        description="Score each skill 0–10. Notes optional. Overall grade updates as you save."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="muted">
              <span data-numeric>{grade.scoredCount}</span>
              {" / "}
              <span data-numeric>{grade.totalSkills}</span> scored
            </Badge>
            {grade.scoredCount > 0 && (
              <Badge variant="accent">
                Grade <span data-numeric>{grade.grade.toFixed(1)}</span>
              </Badge>
            )}
            {grade.division && (
              <span className="inline-flex items-center gap-2 text-body-strong">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-xs"
                  style={{ background: grade.division.color ?? "transparent" }}
                />
                {grade.division.name}
              </span>
            )}
          </div>
        }
      />

      <div className="grid gap-3">
        {active.map((s) => {
          const existing = evalByskill.get(s._id);
          return (
            <SkillCard
              key={s._id}
              memberId={id}
              skill={s}
              existing={existing}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SkillRow {
  _id: Id<"soccerSkills">;
  name: string;
  description?: string;
  maxScore: number;
  weight: number;
}

interface ExistingEval {
  _id: Id<"soccerEvaluations">;
  score: number;
  notes?: string;
  evaluatedAt: number;
}

function SkillCard({
  memberId,
  skill,
  existing,
}: {
  memberId: Id<"members">;
  skill: SkillRow;
  existing?: ExistingEval;
}) {
  const upsert = useMutation(api.soccer.upsertEvaluation);
  const [score, setScore] = React.useState(
    existing ? String(existing.score) : "",
  );
  const [notes, setNotes] = React.useState(existing?.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (existing) {
      setScore(String(existing.score));
      setNotes(existing.notes ?? "");
    }
  }, [existing]);

  async function save() {
    if (score === "") return;
    const n = Number(score);
    if (Number.isNaN(n)) {
      setError("Score must be a number.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await upsert({
        memberId,
        skillId: skill._id,
        score: n,
        notes: notes.trim() || undefined,
      });
      toastSuccess("Score saved.");
    } catch (err) {
      setError(toastFailure(err, "Could not save score."));
    } finally {
      setSaving(false);
    }
  }

  const pct = existing
    ? Math.round((existing.score / skill.maxScore) * 100)
    : 0;
  const tone =
    pct >= 80 ? "text-success" : pct >= 60 ? "text-warning" : "text-ink-soft";

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3 border-b border-hairline">
        <div className="min-w-0">
          <h3 className="text-title text-ink-strong">{skill.name}</h3>
          {skill.description && (
            <p className="text-caption text-ink-quiet mt-0.5 max-w-prose">
              {skill.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-caption text-ink-quiet">
          <span>
            Weight <span data-numeric>{skill.weight.toFixed(2)}</span>
          </span>
          <span>
            Max <span data-numeric>{skill.maxScore}</span>
          </span>
          {existing && (
            <span className={`font-semi ${tone}`} data-numeric>
              {existing.score}
            </span>
          )}
        </div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-3 px-5 py-4 items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`sc-${skill._id}`}>Score</Label>
          <Input
            id={`sc-${skill._id}`}
            type="number"
            min="0"
            max={skill.maxScore}
            step="0.5"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            onBlur={save}
            className="w-24"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`nt-${skill._id}`}>Notes</Label>
          <Input
            id={`nt-${skill._id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={save}
            placeholder="Optional"
          />
        </div>
        <Button onClick={save} disabled={saving || score === ""}>
          {saving ? "Saving…" : existing ? "Update" : "Save"}
        </Button>
      </div>
      {error && <p className="px-5 pb-3 text-caption text-danger">{error}</p>}
    </section>
  );
}
