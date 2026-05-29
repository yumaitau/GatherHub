import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Megaphone, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { formatDateTime } from "@/lib/utils";

type Announcement = {
  _id: Id<"announcements">;
  _creationTime: number;
  title: string;
  body: string;
  pinned: boolean;
  teamName: string | null;
  isRead: boolean;
  authorName: string | null;
};

export default function AnnouncementsPage() {
  const { can } = useGatherHub();
  const announcements = useQuery(api.announcements.list, {});

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Club and team updates."
        actions={can("coach") ? <NewAnnouncementDialog /> : undefined}
      />

      {announcements === undefined ? (
        <LoadingState />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="Nothing has been posted yet."
          action={can("coach") ? <NewAnnouncementDialog /> : undefined}
        />
      ) : (
        <div className="grid gap-4">
          {announcements.map((a) => (
            <AnnouncementCard key={a._id} announcement={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  const { can } = useGatherHub();
  const markRead = useMutation(api.announcements.markRead);
  const setPinned = useMutation(api.announcements.setPinned);
  const remove = useMutation(api.announcements.remove);
  const [expanded, setExpanded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function expand() {
    setExpanded((v) => !v);
    if (!announcement.isRead) {
      markRead({ announcementId: announcement._id }).catch(() => {
        /* ignore */
      });
    }
  }

  async function togglePin(e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    try {
      await setPinned({
        announcementId: announcement._id,
        pinned: !announcement.pinned,
      });
    } catch (err) {
      setError(String(err));
    }
  }

  async function doRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Delete this announcement?")) return;
    setError(null);
    try {
      await remove({ announcementId: announcement._id });
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Card className={announcement.pinned ? "border-primary/40" : undefined}>
      <CardHeader
        className="cursor-pointer"
        onClick={expand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            expand();
          }
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              {!announcement.isRead && (
                <span
                  className="h-2 w-2 rounded-full bg-primary"
                  aria-label="Unread"
                />
              )}
              {announcement.pinned && (
                <Pin className="h-4 w-4 text-primary" aria-label="Pinned" />
              )}
              {announcement.title}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {announcement.authorName ?? "Unknown"} ·{" "}
              {formatDateTime(announcement._creationTime)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={announcement.teamName ? "secondary" : "muted"}>
              {announcement.teamName ?? "Club-wide"}
            </Badge>
            {can("committee") && (
              <Button
                variant="ghost"
                size="icon"
                title={announcement.pinned ? "Unpin" : "Pin"}
                onClick={togglePin}
              >
                {announcement.pinned ? (
                  <PinOff className="h-4 w-4" />
                ) : (
                  <Pin className="h-4 w-4" />
                )}
              </Button>
            )}
            {can("coach") && (
              <Button
                variant="ghost"
                size="icon"
                title="Delete"
                onClick={doRemove}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      )}
    </Card>
  );
}

function NewAnnouncementDialog() {
  const { can } = useGatherHub();
  const create = useMutation(api.announcements.create);
  const teams = useQuery(api.teams.list, {});
  const canOrgWide = can("committee");
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  // "org" only selectable by committee+, otherwise a team must be chosen.
  const [teamId, setTeamId] = React.useState<string>(canOrgWide ? "org" : "");
  const [pinned, setPinned] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setTeamId(canOrgWide ? "org" : "");
    setPinned(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId) {
      setError("Choose a team for this announcement.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await create({
        title,
        body,
        teamId: teamId === "org" ? undefined : (teamId as Id<"teams">),
        pinned,
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
          New announcement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Post an update to your club or a specific team.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ann-body">Body</Label>
              <Textarea
                id="ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Audience</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select audience…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org" disabled={!canOrgWide}>
                    Club-wide{!canOrgWide ? " (committee only)" : ""}
                  </SelectItem>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4"
              />
              Pin to top
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Posting…" : "Post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
