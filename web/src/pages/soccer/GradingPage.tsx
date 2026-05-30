import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Gauge } from "lucide-react";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";

export default function GradingPage() {
  const { org } = useGatherHub();
  const roster = useQuery(api.soccer.playerRoster, {});

  if (!org?.soccerMode) {
    return (
      <EmptyState
        icon={Gauge}
        title="Soccer mode is off"
        description="Enable Soccer club mode in Settings to use grading."
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
        title="Grading"
        description="Score each player on the active rubric. Overall grade auto-computes and matches a division band."
      />
      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        {roster === undefined ? (
          <LoadingState />
        ) : roster.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No active members to grade"
            description="Mark members active in Members, then return here to evaluate."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead numeric>Grade</TableHead>
                <TableHead>Division</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((p) => (
                <TableRow key={p.memberId}>
                  <TableCell className="font-semi text-ink-strong">
                    {p.name}
                  </TableCell>
                  <TableCell numeric>
                    {p.scoredCount === 0 ? (
                      <span className="text-ink-quiet">—</span>
                    ) : (
                      <span className="font-strong text-ink-strong">
                        {p.grade.toFixed(1)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.division ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="inline-block h-3 w-3 rounded-xs"
                          style={{
                            background: p.division.color ?? "transparent",
                          }}
                        />
                        {p.division.name}
                      </span>
                    ) : (
                      <span className="text-ink-quiet">unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    <span data-numeric>{p.scoredCount}</span>
                    {" / "}
                    <span data-numeric>{p.totalSkills}</span>
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/grading/${p.memberId}`}>Evaluate</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

export function PlayerEvaluationPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const id = memberId as Id<"members">;
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
        <Link to="/grading">
          <ArrowLeft className="h-4 w-4" /> Grading
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      {error && (
        <p className="px-5 pb-3 text-caption text-danger">{error}</p>
      )}
    </section>
  );
}
