import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Plus, Trash2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, LoadingState, RoleBadge } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { formatDate, humanise } from "@/lib/utils";
import { DOCUMENT_UPLOAD_ACCEPT, uploadDocumentFile } from "@/lib/uploads";

type MemberData = NonNullable<ReturnType<typeof useMemberData>>;

function useMemberData(memberId: string | undefined) {
  return useQuery(
    api.members.get,
    memberId ? { memberId: memberId as Id<"members"> } : "skip",
  );
}

export default function MemberDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { hasCapability } = useGatherHub();
  const canEditMembers = hasCapability("members.write");
  const canDeleteMembers = hasCapability("members.delete");
  const canManageTraining = hasCapability("training.manage");
  const navigate = useNavigate();
  const data = useMemberData(memberId);
  const update = useMutation(api.members.update);
  const remove = useMutation(api.members.remove);
  const [error, setError] = React.useState<string | null>(null);

  if (data === undefined) return <LoadingState />;

  const { member } = data;

  async function toggleStatus() {
    setError(null);
    try {
      await update({
        memberId: member._id,
        status: member.status === "active" ? "inactive" : "active",
      });
      toastSuccess(
        member.status === "active"
          ? "Member set inactive."
          : "Member set active.",
      );
    } catch (err) {
      setError(toastFailure(err, "Could not update member status."));
    }
  }

  async function deleteMember() {
    if (
      !window.confirm(
        `Delete ${member.firstName} ${member.lastName}? This cannot be undone.`,
      )
    )
      return;
    setError(null);
    try {
      await remove({ memberId: member._id });
      toastSuccess("Member deleted.");
      navigate("/members");
    } catch (err) {
      setError(toastFailure(err, "Could not delete member."));
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link to="/members">
          <ArrowLeft className="h-4 w-4" />
          Members
        </Link>
      </Button>
      <PageHeader
        title={`${member.firstName} ${member.lastName}`}
        description={member.email ?? undefined}
        actions={
          <>
            {canEditMembers && (
              <Button variant="outline" onClick={toggleStatus}>
                {member.status === "active" ? "Set inactive" : "Set active"}
              </Button>
            )}
            {canDeleteMembers && (
              <Button variant="destructive" onClick={deleteMember}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Badge variant={member.status === "active" ? "success" : "muted"}>
          {member.status === "active" ? "Active" : "Inactive"}
        </Badge>
        {member.clubRole && (
          <Badge variant="muted">{humanise(member.clubRole)}</Badge>
        )}
        {member.isVolunteer && <Badge variant="secondary">Volunteer</Badge>}
        {member.isLifetimeMember && (
          <Badge variant="accent" withDot>
            Lifetime
            {member.lifetimeMemberSince
              ? ` · since ${member.lifetimeMemberSince}`
              : ""}
          </Badge>
        )}
      </div>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="contacts">Guardians &amp; contacts</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="certs">Certifications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab member={member} canEdit={canEditMembers} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsTab data={data} canEdit={canEditMembers} />
        </TabsContent>
        <TabsContent value="teams">
          <TeamsTab data={data} />
        </TabsContent>
        <TabsContent value="certs">
          <CertificationsTab data={data} canEdit={canManageTraining} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab({
  member,
  canEdit,
}: {
  member: MemberData["member"];
  canEdit: boolean;
}) {
  const update = useMutation(api.members.update);
  const [firstName, setFirstName] = React.useState(member.firstName);
  const [lastName, setLastName] = React.useState(member.lastName);
  const [email, setEmail] = React.useState(member.email ?? "");
  const [phone, setPhone] = React.useState(member.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = React.useState(
    member.dateOfBirth ?? "",
  );
  const [notes, setNotes] = React.useState(member.notes ?? "");
  const [isVolunteer, setIsVolunteer] = React.useState(member.isVolunteer);
  const [skills, setSkills] = React.useState(
    (member.volunteerSkills ?? []).join(", "),
  );
  const [availability, setAvailability] = React.useState(
    member.volunteerAvailability ?? "",
  );
  const [volunteerNotes, setVolunteerNotes] = React.useState(
    member.volunteerNotes ?? "",
  );
  const [isLifetimeMember, setIsLifetimeMember] = React.useState(
    Boolean(member.isLifetimeMember),
  );
  const [lifetimeMemberSince, setLifetimeMemberSince] = React.useState(
    member.lifetimeMemberSince ?? "",
  );
  const [lifetimeMemberNotes, setLifetimeMemberNotes] = React.useState(
    member.lifetimeMemberNotes ?? "",
  );
  const [lifetimeMemberFirstAddedToClub, setLifetimeMemberFirstAddedToClub] =
    React.useState(member.lifetimeMemberFirstAddedToClub ?? "");
  const [lifetimeMemberAddedBy, setLifetimeMemberAddedBy] = React.useState(
    member.lifetimeMemberAddedBy ?? "",
  );
  const setLifetime = useMutation(api.members.setLifetimeMember);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await update({
        memberId: member._id,
        firstName,
        lastName,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        notes: notes.trim() || undefined,
        isVolunteer,
        volunteerSkills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        volunteerAvailability: availability.trim() || undefined,
        volunteerNotes: volunteerNotes.trim() || undefined,
      });
      await setLifetime({
        memberId: member._id,
        isLifetimeMember,
        lifetimeMemberSince: lifetimeMemberSince.trim() || undefined,
        lifetimeMemberNotes: lifetimeMemberNotes.trim() || undefined,
        lifetimeMemberFirstAddedToClub:
          lifetimeMemberFirstAddedToClub.trim() || undefined,
        lifetimeMemberAddedBy: lifetimeMemberAddedBy.trim() || undefined,
      });
      setSaved(true);
      toastSuccess("Member profile saved.");
    } catch (err) {
      setError(toastFailure(err, "Could not save member profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="m-first">First name</Label>
              <Input
                id="m-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={!canEdit}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-last">Last name</Label>
              <Input
                id="m-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={!canEdit}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="m-email">Email</Label>
              <Input
                id="m-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-phone">Phone</Label>
              <Input
                id="m-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="m-dob">Date of birth</Label>
            <Input
              id="m-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={!canEdit}
              className="max-w-xs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="m-notes">Notes</Label>
            <Textarea
              id="m-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isVolunteer}
              onChange={(e) => setIsVolunteer(e.target.checked)}
              disabled={!canEdit}
              className="h-4 w-4"
            />
            Volunteer
          </label>
          {isVolunteer && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="m-skills">
                  Volunteer skills (comma separated)
                </Label>
                <Input
                  id="m-skills"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-availability">Availability</Label>
                <Input
                  id="m-availability"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-vnotes">Volunteer notes</Label>
                <Textarea
                  id="m-vnotes"
                  value={volunteerNotes}
                  onChange={(e) => setVolunteerNotes(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isLifetimeMember}
              onChange={(e) => setIsLifetimeMember(e.target.checked)}
              disabled={!canEdit}
              className="h-4 w-4 accent-primary"
            />
            Lifetime member
          </label>
          {isLifetimeMember && (
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="m-lifesince">Member since</Label>
                <Input
                  id="m-lifesince"
                  value={lifetimeMemberSince}
                  onChange={(e) => setLifetimeMemberSince(e.target.value)}
                  placeholder="e.g. 1998"
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-lifenotes">Lifetime notes</Label>
                <Input
                  id="m-lifenotes"
                  value={lifetimeMemberNotes}
                  onChange={(e) => setLifetimeMemberNotes(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-lifefirst">First added to club</Label>
                <Input
                  id="m-lifefirst"
                  value={lifetimeMemberFirstAddedToClub}
                  onChange={(e) =>
                    setLifetimeMemberFirstAddedToClub(e.target.value)
                  }
                  placeholder="e.g. 1992 or 1992-03-14"
                  disabled={!canEdit}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-lifeaddedby">Added by</Label>
                <Input
                  id="m-lifeaddedby"
                  value={lifetimeMemberAddedBy}
                  onChange={(e) => setLifetimeMemberAddedBy(e.target.value)}
                  placeholder="e.g. Committee 2024"
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}
          {error && <p className="text-caption text-danger">{error}</p>}
          {saved && <p className="text-caption text-success">Saved.</p>}
          {canEdit && (
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function ContactsTab({
  data,
  canEdit,
}: {
  data: MemberData;
  canEdit: boolean;
}) {
  const removeGuardian = useMutation(api.members.removeGuardian);
  const removeContact = useMutation(api.members.removeEmergencyContact);
  const [error, setError] = React.useState<string | null>(null);

  async function rmGuardian(linkId: Id<"guardians">) {
    setError(null);
    try {
      await removeGuardian({ linkId });
      toastSuccess("Guardian removed.");
    } catch (err) {
      setError(toastFailure(err, "Could not remove guardian."));
    }
  }
  async function rmContact(contactId: Id<"emergencyContacts">) {
    setError(null);
    try {
      await removeContact({ contactId });
      toastSuccess("Emergency contact removed.");
    } catch (err) {
      setError(toastFailure(err, "Could not remove emergency contact."));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {error && (
        <p className="text-sm text-destructive lg:col-span-2">{error}</p>
      )}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Guardians</CardTitle>
          {canEdit && <AddGuardianDialog memberId={data.member._id} />}
        </CardHeader>
        <CardContent>
          {data.guardians.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No guardians linked.
            </p>
          ) : (
            <ul className="divide-y">
              {data.guardians.map((g) => (
                <li
                  key={g.link._id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    {g.guardian ? (
                      <Link
                        to={`/members/${g.guardian._id}`}
                        className="font-medium hover:underline"
                      >
                        {g.guardian.firstName} {g.guardian.lastName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Unknown</span>
                    )}
                    {g.link.relationship && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {g.link.relationship}
                      </span>
                    )}
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Remove"
                      onClick={() => rmGuardian(g.link._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Emergency contacts</CardTitle>
          {canEdit && <AddEmergencyContactDialog memberId={data.member._id} />}
        </CardHeader>
        <CardContent>
          {data.emergencyContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No emergency contacts.
            </p>
          ) : (
            <ul className="divide-y">
              {data.emergencyContacts.map((c) => (
                <li
                  key={c._id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{c.name}</span>
                    {c.relationship && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.relationship}
                      </span>
                    )}
                    <span className="block text-muted-foreground">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ""}
                    </span>
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Remove"
                      onClick={() => rmContact(c._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamsTab({ data }: { data: MemberData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team memberships</CardTitle>
      </CardHeader>
      <CardContent>
        {data.teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not assigned to any teams.
          </p>
        ) : (
          <ul className="divide-y">
            {data.teams.map((t) => (
              <li
                key={t.link._id}
                className="flex items-center justify-between py-2 text-sm"
              >
                {t.team ? (
                  <Link
                    to={`/teams/${t.team._id}`}
                    className="font-medium hover:underline"
                  >
                    {t.team.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unknown team</span>
                )}
                <RoleBadge role={t.link.role} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CertificationsTab({
  data,
  canEdit,
}: {
  data: MemberData;
  canEdit: boolean;
}) {
  const remove = useMutation(api.certifications.remove);
  const [error, setError] = React.useState<string | null>(null);

  async function rm(certId: Id<"volunteerCertifications">) {
    setError(null);
    try {
      await remove({ certId });
      toastSuccess("Certification removed.");
    } catch (err) {
      setError(toastFailure(err, "Could not remove certification."));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Certifications</CardTitle>
        {canEdit && <AddCertDialog memberId={data.member._id} />}
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {data.certifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No certifications recorded.
          </p>
        ) : (
          <ul className="divide-y">
            {data.certifications.map((c) => (
              <li
                key={c._id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.issuer && (
                    <span className="text-muted-foreground"> · {c.issuer}</span>
                  )}
                  <span className="block text-muted-foreground">
                    {c.expiryDate
                      ? `Expires ${formatDate(c.expiryDate)}`
                      : "No expiry"}
                  </span>
                  {c.documentUrl && (
                    <a
                      href={c.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {c.documentFileName ?? "View document"}
                      </span>
                    </a>
                  )}
                </span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove"
                    onClick={() => rm(c._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddGuardianDialog({ memberId }: { memberId: Id<"members"> }) {
  const [open, setOpen] = React.useState(false);
  const add = useMutation(api.members.addGuardian);
  const members = useQuery(api.members.list, open ? {} : "skip");
  const [guardianMemberId, setGuardianMemberId] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setGuardianMemberId("");
    setRelationship("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!guardianMemberId) {
      setError("Select a guardian.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await add({
        memberId,
        guardianMemberId: guardianMemberId as Id<"members">,
        relationship: relationship.trim() || undefined,
      });
      reset();
      setOpen(false);
      toastSuccess("Guardian added.");
    } catch (err) {
      setError(toastFailure(err, "Could not add guardian."));
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
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add guardian</DialogTitle>
            <DialogDescription>
              Link another member as a guardian.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Guardian</Label>
              <Select
                value={guardianMemberId}
                onValueChange={setGuardianMemberId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a member…" />
                </SelectTrigger>
                <SelectContent>
                  {members === undefined ? (
                    <SelectItem value="loading" disabled>
                      Loading…
                    </SelectItem>
                  ) : (
                    members
                      .filter((m) => m._id !== memberId)
                      .map((m) => (
                        <SelectItem key={m._id} value={m._id}>
                          {m.firstName} {m.lastName}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="g-rel">Relationship</Label>
              <Input
                id="g-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g. Mother"
              />
            </div>
            {error && <p className="text-caption text-danger">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add guardian"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddEmergencyContactDialog({ memberId }: { memberId: Id<"members"> }) {
  const [open, setOpen] = React.useState(false);
  const add = useMutation(api.members.addEmergencyContact);
  const [name, setName] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setName("");
    setRelationship("");
    setPhone("");
    setEmail("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await add({
        memberId,
        name,
        relationship: relationship.trim() || undefined,
        phone,
        email: email.trim() || undefined,
      });
      reset();
      setOpen(false);
      toastSuccess("Emergency contact added.");
    } catch (err) {
      setError(toastFailure(err, "Could not add emergency contact."));
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
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add emergency contact</DialogTitle>
            <DialogDescription>
              Record an emergency contact for this member.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ec-name">Name</Label>
              <Input
                id="ec-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ec-rel">Relationship</Label>
              <Input
                id="ec-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ec-phone">Phone</Label>
              <Input
                id="ec-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ec-email">Email</Label>
              <Input
                id="ec-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-caption text-danger">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddCertDialog({ memberId }: { memberId: Id<"members"> }) {
  const [open, setOpen] = React.useState(false);
  const add = useMutation(api.certifications.create);
  const update = useMutation(api.certifications.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const completeUpload = useAction(api.files.completeUpload);
  const [name, setName] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [issuedDate, setIssuedDate] = React.useState("");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [documentFile, setDocumentFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setName("");
    setIssuer("");
    setIssuedDate("");
    setExpiryDate("");
    setDocumentFile(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const certId = await add({
        memberId,
        name,
        issuer: issuer.trim() || undefined,
        issuedDate: issuedDate || undefined,
        expiryDate: expiryDate || undefined,
      });
      if (documentFile) {
        const uploaded = await uploadDocumentFile(
          generateUploadUrl,
          completeUpload,
          documentFile,
          {
            ownerType: "certifications",
            ownerId: certId,
            purpose: "document",
          },
        );
        await update({
          certId,
          documentStorageId: uploaded.storageId,
          documentFileName: uploaded.fileName,
        });
      }
      reset();
      setOpen(false);
      toastSuccess("Certification added.");
    } catch (err) {
      setError(toastFailure(err, "Could not add certification."));
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
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add certification</DialogTitle>
            <DialogDescription>
              Record a certification for this member.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="mc-name">Name</Label>
              <Input
                id="mc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mc-issuer">Issuer</Label>
              <Input
                id="mc-issuer"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mc-issued">Issued</Label>
                <Input
                  id="mc-issued"
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mc-expiry">Expiry</Label>
                <Input
                  id="mc-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mc-document">Document</Label>
              <Input
                id="mc-document"
                type="file"
                accept={DOCUMENT_UPLOAD_ACCEPT}
                onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {error && <p className="text-caption text-danger">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
