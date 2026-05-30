import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, LoadingState, RsvpBadge } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { formatDateTime, humanise, toCsv, downloadCsv } from "@/lib/utils";

type RsvpStatus = "going" | "not_going" | "maybe";

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { can } = useGatherHub();
  const navigate = useNavigate();
  const coach = can("coach");

  const data = useQuery(
    api.events.get,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
  const setAttendance = useMutation(api.events.setAttendance);
  const remove = useMutation(api.events.remove);
  const [error, setError] = React.useState<string | null>(null);

  if (data === undefined) return <LoadingState />;

  const { event, teamName, rsvps, attendance, counts } = data;

  const presentByMember = new Map<string, boolean>();
  for (const a of attendance) {
    presentByMember.set(a.attendance.memberId, a.attendance.present);
  }

  async function toggleAttendance(memberId: Id<"members">, present: boolean) {
    setError(null);
    try {
      await setAttendance({ eventId: event._id, memberId, present });
    } catch (err) {
      setError(String(err));
    }
  }

  async function deleteEvent() {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    setError(null);
    try {
      await remove({ eventId: event._id });
      navigate("/events");
    } catch (err) {
      setError(String(err));
    }
  }

  function exportAttendance() {
    const rows = rsvps.map((r) => ({
      name: r.member ? `${r.member.firstName} ${r.member.lastName}` : "Unknown",
      rsvp: r.rsvp.status,
      present: presentByMember.get(r.rsvp.memberId) ? "yes" : "no",
    }));
    const csv = toCsv(rows, ["name", "rsvp", "present"]);
    downloadCsv("attendance.csv", csv);
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link to="/events">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Link>
      </Button>
      <PageHeader
        title={event.title}
        description={formatDateTime(event.startTime)}
        actions={
          <>
            <Button variant="outline" onClick={exportAttendance}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            {coach && <SetRsvpDialog eventId={event._id} />}
            {coach && <EditEventDialog event={event} teamName={teamName} />}
            {can("coach") && (
              <Button variant="destructive" onClick={deleteEvent}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <Badge variant="secondary">{humanise(event.type)}</Badge>
        {event.location && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {event.location}
          </span>
        )}
        <span>{teamName ?? "Org-wide"}</span>
        {event.opponent && <span>vs {event.opponent}</span>}
        {event.endTime && <span>Ends {formatDateTime(event.endTime)}</span>}
      </div>
      {event.description && <p className="mb-6 text-sm">{event.description}</p>}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountCard label="Going" value={counts.going} />
        <CountCard label="Maybe" value={counts.maybe} />
        <CountCard label="Not going" value={counts.notGoing} />
        <CountCard label="Present" value={counts.present} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>RSVPs</CardTitle>
        </CardHeader>
        <CardContent>
          {rsvps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>RSVP</TableHead>
                  {coach && <TableHead>Attendance</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rsvps.map((r) => {
                  const present = presentByMember.get(r.rsvp.memberId) ?? false;
                  return (
                    <TableRow key={r.rsvp._id}>
                      <TableCell className="font-medium">
                        {r.member ? (
                          <Link
                            to={`/members/${r.member._id}`}
                            className="hover:underline"
                          >
                            {r.member.firstName} {r.member.lastName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <RsvpBadge status={r.rsvp.status} />
                      </TableCell>
                      {coach && (
                        <TableCell>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={present}
                              onChange={(e) =>
                                toggleAttendance(
                                  r.rsvp.memberId,
                                  e.target.checked,
                                )
                              }
                              className="h-4 w-4"
                            />
                            Present
                          </label>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function SetRsvpDialog({ eventId }: { eventId: Id<"events"> }) {
  const [open, setOpen] = React.useState(false);
  const setRsvp = useMutation(api.events.setRsvp);
  const members = useQuery(api.members.list, open ? {} : "skip");
  const [memberId, setMemberId] = React.useState<string>("");
  const [status, setStatus] = React.useState<RsvpStatus>("going");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setMemberId("");
    setStatus("going");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) {
      setError("Select a member.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await setRsvp({ eventId, memberId: memberId as Id<"members">, status });
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
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          Set RSVP
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Set RSVP</DialogTitle>
            <DialogDescription>
              Record a member's RSVP for this event.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Member</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a member…" />
                </SelectTrigger>
                <SelectContent>
                  {members === undefined ? (
                    <SelectItem value="loading" disabled>
                      Loading…
                    </SelectItem>
                  ) : (
                    members.map((m) => (
                      <SelectItem key={m._id} value={m._id}>
                        {m.firstName} {m.lastName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as RsvpStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="going">Going</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                  <SelectItem value="not_going">Not going</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save RSVP"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface EditableEvent {
  _id: Id<"events">;
  type: string;
  title: string;
  description?: string;
  location?: string;
  startTime: number;
  endTime?: number;
  teamId?: Id<"teams">;
  opponent?: string;
}

function EditEventDialog({
  event,
}: {
  event: EditableEvent;
  teamName: string | null;
}) {
  const update = useMutation(api.events.update);
  const types = useQuery(api.taxonomies.list, { kind: "event_type" });
  const teams = useQuery(api.teams.list, {});
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState(event.type);
  const [title, setTitle] = React.useState(event.title);
  const [startTime, setStartTime] = React.useState(
    toDatetimeLocal(event.startTime),
  );
  const [endTime, setEndTime] = React.useState(
    event.endTime ? toDatetimeLocal(event.endTime) : "",
  );
  const [location, setLocation] = React.useState(event.location ?? "");
  const [teamId, setTeamId] = React.useState<string>(event.teamId ?? "none");
  const [opponent, setOpponent] = React.useState(event.opponent ?? "");
  const [description, setDescription] = React.useState(event.description ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setType(event.type);
      setTitle(event.title);
      setStartTime(toDatetimeLocal(event.startTime));
      setEndTime(event.endTime ? toDatetimeLocal(event.endTime) : "");
      setLocation(event.location ?? "");
      setTeamId(event.teamId ?? "none");
      setOpponent(event.opponent ?? "");
      setDescription(event.description ?? "");
      setError(null);
    }
  }, [open, event]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ms = Date.parse(startTime);
    if (Number.isNaN(ms)) {
      setError("Please choose a valid start time.");
      return;
    }
    const endMs = endTime ? Date.parse(endTime) : undefined;
    if (endMs !== undefined && Number.isNaN(endMs)) {
      setError("End time is invalid.");
      return;
    }
    if (endMs !== undefined && endMs < ms) {
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await update({
        eventId: event._id,
        type,
        title: title.trim(),
        startTime: ms,
        endTime: endMs,
        location: location.trim() || undefined,
        teamId: teamId === "none" ? undefined : (teamId as Id<"teams">),
        opponent: opponent.trim() || undefined,
        description: description.trim() || undefined,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>
            Update details, schedule, or audience.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
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
            <Label htmlFor="ev-title">Title</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ev-start">Start time</Label>
              <Input
                id="ev-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-end">End time (optional)</Label>
              <Input
                id="ev-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ev-loc">Location</Label>
            <Input
              id="ev-loc"
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
          <div className="grid gap-1.5">
            <Label htmlFor="ev-opp">Opponent</Label>
            <Input
              id="ev-opp"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ev-desc">Description</Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
