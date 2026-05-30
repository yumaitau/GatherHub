import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Layers, Settings as SettingsIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";

export default function SoccerDivisionsPage() {
  const { org, can } = useGatherHub();
  const divisions = useQuery(api.soccer.divisionRoster, {});

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
        description="Players are assigned by registration or by their computed grade falling inside a division's band."
        actions={
          can("committee") && (
            <Button variant="outline" asChild>
              <Link to="/settings">
                <SettingsIcon className="h-4 w-4" /> Configure bands
              </Link>
            </Button>
          )
        }
      />
      {divisions === undefined ? (
        <LoadingState />
      ) : divisions.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No divisions yet"
          description="Set up grade bands in Settings → Soccer to start assigning players."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {divisions.map((d) => (
            <section
              key={d.id}
              className="rounded-md border border-hairline bg-surface overflow-hidden"
            >
              <header className="flex items-center gap-3 px-5 py-3 border-b border-hairline">
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 rounded-xs"
                  style={{ background: d.color ?? "transparent" }}
                />
                <h2 className="text-title text-ink-strong">{d.name}</h2>
                {!d.active && (
                  <Badge variant="muted" className="ml-auto">
                    Hidden
                  </Badge>
                )}
                {d.active && (
                  <span className="ml-auto text-caption text-ink-quiet">
                    grade <span data-numeric>{d.minGrade}</span>
                    {" – "}
                    <span data-numeric>{d.maxGrade}</span>
                  </span>
                )}
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
