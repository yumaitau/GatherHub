import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { CalendarDays, Plus, MapPin, Users } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { formatDateTime, humanise } from "@/lib/utils";

type ChipVariant = "accent" | "muted" | "warning" | "success" | "info";

// Stable variant for well-known default keys; everything else falls back
// to "muted" so org-added types render cleanly without configuration.
const TYPE_VARIANT_DEFAULT: Record<string, ChipVariant> = {
  match: "accent",
  training: "muted",
  meeting: "warning",
  social: "success",
  working_bee: "info",
};

function variantForType(key: string): ChipVariant {
  return TYPE_VARIANT_DEFAULT[key] ?? "muted";
}

export default function EventsPage() {
  const { can } = useGatherHub();
  const [upcomingOnly, setUpcomingOnly] = React.useState(true);
  const events = useQuery(api.events.list, { upcomingOnly });
  const types = useQuery(api.taxonomies.list, { kind: "event_type" });
  const typeLabel = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of types ?? []) m.set(t.key, t.label);
    return (key: string) => m.get(key) ?? humanise(key);
  }, [types]);

  return (
    <div>
      <PageHeader
        title="Events"
        description="Training, matches and meetings."
        actions={can("coach") ? <NewEventDialog /> : undefined}
      />

      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-hairline">
          <label className="flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={!upcomingOnly}
              onChange={(e) => setUpcomingOnly(!e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Include past events
          </label>
          {events && (
            <span className="ml-auto text-caption text-ink-quiet">
              <span data-numeric className="font-medium text-ink-soft">
                {events.length}
              </span>{" "}
              {events.length === 1 ? "event" : "events"}
            </span>
          )}
        </div>

        {events === undefined ? (
          <LoadingState />
        ) : events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No events"
            description={
              upcomingOnly
                ? "There are no upcoming events scheduled."
                : "No events have been created yet."
            }
            action={can("coach") ? <NewEventDialog /> : undefined}
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {events.map((e) => (
              <li key={e._id}>
                <Link
                  to={`/events/${e._id}`}
                  className="group/event block px-5 py-3.5 hover:bg-surface-sunk/60 transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
                    <Badge variant={variantForType(e.type)}>
                      {typeLabel(e.type)}
                    </Badge>
                    <h3 className="text-body-strong text-ink-strong group-hover/event:text-primary">
                      {e.title}
                    </h3>
                    <time
                      className="text-caption text-ink-quiet"
                      dateTime={new Date(e.startTime).toISOString()}
                    >
                      {formatDateTime(e.startTime)}
                    </time>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-soft">
                    <span className="inline-flex items-center gap-1.5">
                      <Users
                        className="h-3.5 w-3.5 text-ink-quiet"
                        aria-hidden="true"
                      />
                      <span data-numeric className="font-medium text-ink">
                        {e.goingCount}
                      </span>{" "}
                      going
                    </span>
                    {e.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin
                          className="h-3.5 w-3.5 text-ink-quiet"
                          aria-hidden="true"
                        />
                        {e.location}
                      </span>
                    )}
                    <span className="text-ink-quiet">
                      {e.teamName ?? "Org-wide"}
                    </span>
                    {e.opponent && (
                      <span className="text-ink-quiet">vs {e.opponent}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewEventDialog() {
  const create = useMutation(api.events.create);
  const teams = useQuery(api.teams.list, {});
  const types = useQuery(api.taxonomies.list, { kind: "event_type" });
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<string>("");

  React.useEffect(() => {
    if (!type && types && types.length > 0) {
      const def = types.find((t) => t.isDefault) ?? types[0];
      if (def) setType(def.key);
    }
  }, [types, type]);
  const [title, setTitle] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [teamId, setTeamId] = React.useState<string>("none");
  const [opponent, setOpponent] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    const def = types?.find((t) => t.isDefault) ?? types?.[0];
    setType(def?.key ?? "");
    setTitle("");
    setStartTime("");
    setLocation("");
    setTeamId("none");
    setOpponent("");
    setDescription("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ms = Date.parse(startTime);
    if (Number.isNaN(ms)) {
      setError("Please choose a valid start time.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await create({
        type,
        title,
        startTime: ms,
        location: location.trim() || undefined,
        teamId: teamId === "none" ? undefined : (teamId as Id<"teams">),
        opponent: opponent.trim() || undefined,
        description: description.trim() || undefined,
      });
      reset();
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            Schedule a training, match or meeting.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-start">Start time</Label>
            <Input
              id="event-start"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Org-wide" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Org-wide</SelectItem>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "match" && (
            <div className="grid gap-1.5">
              <Label htmlFor="event-opponent">Opponent</Label>
              <Input
                id="event-opponent"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="event-desc">Description</Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
