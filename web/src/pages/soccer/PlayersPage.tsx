import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Users, Download } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
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
import { downloadCsv, toCsv } from "@/lib/utils";

export default function SoccerPlayersPage() {
  const { org } = useGatherHub();
  const rows = useQuery(api.soccer.playerListing, {});

  if (!org?.soccerMode) {
    return (
      <EmptyState
        icon={Users}
        title="Soccer mode is off"
        description="Enable Soccer club mode in Settings to use the player roster."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  function exportCsv() {
    if (!rows) return;
    const out = rows.map((r) => ({
      name: r.name,
      email: r.email ?? "",
      dob: r.dateOfBirth ?? "",
      registered: r.registered ? "yes" : "no",
      paid: r.paid ? "yes" : "no",
      team: r.teamName ?? "",
      division: r.divisionName ?? "",
      grade: r.grade != null ? r.grade.toFixed(1) : "",
      scored: `${r.scoredCount}/${r.totalSkills}`,
    }));
    downloadCsv(
      "players.csv",
      toCsv(out, [
        "name",
        "email",
        "dob",
        "registered",
        "paid",
        "team",
        "division",
        "grade",
        "scored",
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Players"
        description="Every member with a soccer registration or evaluation, including team, division, and grade progress."
        actions={
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!rows || rows.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        {rows === undefined ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet"
            description="Add members and assign registrations to populate the player roster."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Division</TableHead>
                <TableHead numeric>Grade</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.memberId}>
                  <TableCell>
                    <Link
                      to={`/members/${r.memberId}`}
                      className="font-semi text-ink-strong hover:text-primary"
                    >
                      {r.name}
                    </Link>
                    {r.email && (
                      <p className="text-caption text-ink-quiet truncate max-w-[24ch]">
                        {r.email}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {!r.hasRegistration ? (
                      <Badge variant="outline">No rego</Badge>
                    ) : r.registered && r.paid ? (
                      <Badge variant="success">Active</Badge>
                    ) : r.registered ? (
                      r.paymentPlan ? (
                        <Badge variant="warning">Plan</Badge>
                      ) : (
                        <Badge variant="destructive">Unpaid</Badge>
                      )
                    ) : (
                      <Badge variant="muted">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    {r.teamName ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.divisionName ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="inline-block h-3 w-3 rounded-xs"
                          style={{
                            background: r.divisionColor ?? "transparent",
                          }}
                        />
                        {r.divisionName}
                      </span>
                    ) : (
                      <span className="text-ink-quiet">—</span>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    {r.grade != null ? r.grade.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    <Link
                      to={`/soccer/grading/${r.memberId}`}
                      className="hover:text-primary"
                    >
                      <span data-numeric>{r.scoredCount}</span>
                      {" / "}
                      <span data-numeric>{r.totalSkills}</span>
                    </Link>
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
