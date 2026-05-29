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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type EventType = "training" | "match" | "meeting";

const TYPE_VARIANT: Record<EventType, "default" | "secondary" | "warning"> = {
  match: "default",
  training: "secondary",
  meeting: "warning",
};

export default function EventsPage() {
  const { can } = useGatherHub();
  const [upcomingOnly, setUpcomingOnly] = React.useState(true);
  const events = useQuery(api.events.list, { upcomingOnly });

  return (
    <div>
      <PageHeader
        title="Events"
        description="Training, matches and meetings."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={!upcomingOnly}
                onChange={(e) => setUpcomingOnly(!e.target.checked)}
                className="h-4 w-4"
              />
              Show past events
            </label>
            {can("coach") && <NewEventDialog />}
          </>
        }
      />

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
        <div className="grid gap-4">
          {events.map((e) => (
            <Link key={e._id} to={`/events/${e._id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Badge variant={TYPE_VARIANT[e.type as EventType]}>
                          {humanise(e.type)}
                        </Badge>
                        {e.title}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {formatDateTime(e.startTime)}
                        {e.opponent ? ` · vs ${e.opponent}` : ""}
                      </CardDescription>
                    </div>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {e.goingCount} going
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {e.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {e.location}
                    </span>
                  )}
                  {e.teamName && <span>{e.teamName}</span>}
                  {!e.teamName && <span>Org-wide</span>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewEventDialog() {
  const create = useMutation(api.events.create);
  const teams = useQuery(api.teams.list, {});
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<EventType>("training");
  const [title, setTitle] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [teamId, setTeamId] = React.useState<string>("none");
  const [opponent, setOpponent] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setType("training");
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
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New event</DialogTitle>
            <DialogDescription>
              Schedule a training, match or meeting.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as EventType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="match">Match</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-start">Start time</Label>
              <Input
                id="event-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-location">Location</Label>
              <Input
                id="event-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
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
              <div className="grid gap-2">
                <Label htmlFor="event-opponent">Opponent</Label>
                <Input
                  id="event-opponent"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="event-desc">Description</Label>
              <Textarea
                id="event-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
