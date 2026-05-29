import * as React from "react";
import { useQuery, useMutation } from "convex/react";
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
import { useGatherHub } from "@/lib/gatherhub";
import { ALL_ROLES, type Role } from "@/lib/roles";
import { humanise } from "@/lib/utils";

export default function SettingsPage() {
  const { org } = useGatherHub();
  return (
    <div>
      <PageHeader
        title="Settings"
        description={`Manage ${org?.name ?? "your club"}.`}
      />
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Members & roles</TabsTrigger>
          <TabsTrigger value="public">Public website</TabsTrigger>
        </TabsList>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="public">
          <PublicSiteTab />
        </TabsContent>
      </Tabs>
    </div>
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
          server-side. These app roles are independent of Clerk's org roles.
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
            Enable public website for this club
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
