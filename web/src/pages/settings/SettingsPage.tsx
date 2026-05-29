import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Mail, RefreshCw, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader, LoadingState } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { useGatherHub } from "@/lib/gatherhub";
import { ALL_ROLES, type Role } from "@/lib/roles";
import { humanise, formatDateTime } from "@/lib/utils";

export default function SettingsPage() {
  const { org, can } = useGatherHub();
  const isAdmin = can("admin");
  return (
    <div>
      <PageHeader
        title="Settings"
        description={`Manage ${org?.name ?? "your organisation"}.`}
      />
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Members & roles</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          )}
          <TabsTrigger value="public">Public website</TabsTrigger>
        </TabsList>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="invitations">
            <InvitationsTab />
          </TabsContent>
        )}
        <TabsContent value="public">
          <PublicSiteTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Convex-native invitations: send by email + shareable invite code. Admin+
 * only (gated by the tab trigger and enforced server-side in
 * `convex/invitations.ts` / `convex/organizations.ts`).
 */
function InvitationsTab() {
  return (
    <div className="grid gap-6">
      <SendInviteCard />
      <InviteCodeCard />
      <InvitationListCard />
    </div>
  );
}

function SendInviteCard() {
  const send = useMutation(api.invitations.send);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("player");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await send({ email: email.trim(), role });
      setMessage(`Invitation sent to ${email.trim()}.`);
      setEmail("");
      setRole("player");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" /> Invite by email
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {humanise(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </form>
        {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function InviteCodeCard() {
  const data = useQuery(api.organizations.getInviteCode);
  const rotate = useMutation(api.organizations.rotateInviteCode);
  const [busy, setBusy] = React.useState(false);

  async function onRotate() {
    setBusy(true);
    try {
      await rotate({});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shareable invite code</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Anyone signed in with this code can join as a Player. Rotate to invalidate the previous code.
        </p>
        <div className="flex items-center gap-3">
          <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm">
            {data?.code ?? "—"}
          </code>
          <Button variant="outline" onClick={onRotate} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
            {busy ? "Rotating…" : "Rotate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InvitationListCard() {
  const invites = useQuery(api.invitations.list);
  const revoke = useMutation(api.invitations.revoke);

  if (invites === undefined) return <LoadingState />;
  if (invites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No invitations sent yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{humanise(i.role)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      i.status === "accepted"
                        ? "success"
                        : i.status === "pending"
                          ? "secondary"
                          : "muted"
                    }
                  >
                    {humanise(i.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(i.sentAt)}
                </TableCell>
                <TableCell>
                  {i.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke({ invitationId: i.id })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RolesTab() {
  const members = useQuery(api.roles.listMembers);
  const updateRole = useMutation(api.roles.updateRole);
  const [error, setError] = React.useState<string | null>(null);

  async function change(membershipId: Id<"memberships">, role: Role) {
    setError(null);
    try {
      await updateRole({ membershipId, role });
    } catch (e) {
      setError(String(e));
    }
  }

  if (members === undefined) return <LoadingState />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members & roles</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.membershipId}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {m.email ?? "—"}
                </TableCell>
                <TableCell>
                  <Select
                    value={m.role}
                    onValueChange={(v) => change(m.membershipId, v as Role)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {humanise(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-4 text-xs text-muted-foreground">
          Roles control what members can do. All permissions are enforced
          server-side.
        </p>
      </CardContent>
    </Card>
  );
}

function PublicSiteTab() {
  const settings = useQuery(api.publicSite.getSettings);
  const upsert = useMutation(api.publicSite.upsertSettings);
  const { org } = useGatherHub();

  const [form, setForm] = React.useState({
    enabled: false,
    tagline: "",
    about: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    websiteUrl: "",
  });
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (settings && !loadedRef.current) {
      loadedRef.current = true;
      setForm({
        enabled: settings.enabled,
        tagline: settings.tagline ?? "",
        about: settings.about ?? "",
        contactEmail: settings.contactEmail ?? "",
        contactPhone: settings.contactPhone ?? "",
        address: settings.address ?? "",
        websiteUrl: settings.websiteUrl ?? "",
      });
    }
  }, [settings]);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await upsert({
        enabled: form.enabled,
        tagline: form.tagline || undefined,
        about: form.about || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        address: form.address || undefined,
        websiteUrl: form.websiteUrl || undefined,
      });
      setSaved(true);
    } catch (e) {
      setError(String(e));
    }
  }

  if (settings === undefined) return <LoadingState />;

  const publicUrl = org?.slug ? `/club/${org.slug}` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public website</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <span className="text-sm font-medium">
            Enable public website for this organisation
          </span>
        </label>
        {publicUrl && form.enabled && (
          <p className="text-sm text-muted-foreground">
            Live at{" "}
            <a href={publicUrl} className="text-primary hover:underline">
              {publicUrl}
            </a>
          </p>
        )}
        <div>
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="about">About</Label>
          <Textarea
            id="about"
            rows={5}
            value={form.about}
            onChange={(e) => setForm({ ...form, about: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cemail">Contact email</Label>
            <Input
              id="cemail"
              value={form.contactEmail}
              onChange={(e) =>
                setForm({ ...form, contactEmail: e.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="cphone">Contact phone</Label>
            <Input
              id="cphone"
              value={form.contactPhone}
              onChange={(e) =>
                setForm({ ...form, contactPhone: e.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="addr">Address</Label>
            <Input
              id="addr"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="weburl">Website URL</Label>
            <Input
              id="weburl"
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save}>Save settings</Button>
          {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
        </div>
      </CardContent>
    </Card>
  );
}
