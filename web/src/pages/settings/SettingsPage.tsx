import * as React from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import {
  Mail,
  RefreshCw,
  X,
  Star,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Trash2,
  Plus,
  MapPin,
  ShieldOff,
} from "lucide-react";
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
import { SoccerSettingsTab } from "@/pages/soccer/SoccerSettingsTab";
import { FieldServiceSettingsTab } from "@/pages/settings/FieldServiceSettingsTab";
import { QrSettingsTab } from "@/pages/settings/QrSettingsTab";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import {
  AddressAutocompleteInput,
  LocationInput,
} from "@/components/location/AddressAutocompleteInput";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { ALL_ROLES, type Role } from "@/lib/roles";
import { CAPABILITY_LABELS, type Capability } from "@/lib/capabilities";
import { humanise, formatDateTime } from "@/lib/utils";
import {
  DEFAULT_TERMINOLOGY,
  MODULE_LABELS,
  moduleEnabled,
  sportSectionLabel,
  type OrganizationKind,
  type OrganizationModuleKey,
  type OrganizationTerminology,
  type SportKey,
} from "@/lib/verticals";

export default function SettingsPage() {
  const { org, hasCapability } = useGatherHub();
  const canManage = hasCapability("settings.admin");
  const sportEnabled = moduleEnabled(org, "sport");
  const sportName = sportSectionLabel(org);
  if (!canManage) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Access denied"
        description="Settings are available to committee members and above."
      />
    );
  }
  return (
    <div>
      <PageHeader
        title="Settings"
        description={`Manage ${org?.name ?? "your organisation"}.`}
      />
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="profile">Organisation profile</TabsTrigger>
          <TabsTrigger value="roles">Members & roles</TabsTrigger>
          {hasCapability("invitations.manage") && (
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          )}
          <TabsTrigger value="locations">Locations</TabsTrigger>
          {hasCapability("settings.admin") && (
            <TabsTrigger value="taxonomies">Lists & types</TabsTrigger>
          )}
          {hasCapability("soccer.manage") && (
            <TabsTrigger value="soccer">
              {sportName}
              {sportEnabled ? "" : " (off)"}
            </TabsTrigger>
          )}
          {hasCapability("settings.admin") &&
            moduleEnabled(org, "field_service") && (
              <TabsTrigger value="field_service">Field service</TabsTrigger>
            )}
          {hasCapability("settings.admin") && (
            <TabsTrigger value="qr">QR codes</TabsTrigger>
          )}
          <TabsTrigger value="public">Public website</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileSettingsTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        {hasCapability("invitations.manage") && (
          <TabsContent value="invitations">
            <InvitationsTab />
          </TabsContent>
        )}
        <TabsContent value="locations">
          <LocationSettingsTab />
        </TabsContent>
        {hasCapability("settings.admin") && (
          <TabsContent value="taxonomies">
            <TaxonomiesTab />
          </TabsContent>
        )}
        {hasCapability("soccer.manage") && (
          <TabsContent value="soccer">
            <SoccerSettingsTab />
          </TabsContent>
        )}
        {hasCapability("settings.admin") &&
          moduleEnabled(org, "field_service") && (
            <TabsContent value="field_service">
              <FieldServiceSettingsTab />
            </TabsContent>
          )}
        {hasCapability("settings.admin") && (
          <TabsContent value="qr">
            <QrSettingsTab />
          </TabsContent>
        )}
        <TabsContent value="public">
          <PublicSiteTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const TERMINOLOGY_FIELDS: Array<{
  key: keyof OrganizationTerminology;
  label: string;
}> = [
  { key: "orgSingular", label: "Organisation singular" },
  { key: "orgPlural", label: "Organisation plural" },
  { key: "memberSingular", label: "Person singular" },
  { key: "memberPlural", label: "Person plural" },
  { key: "teamSingular", label: "Team/group singular" },
  { key: "teamPlural", label: "Team/group plural" },
  { key: "eventSingular", label: "Event/job singular" },
  { key: "eventPlural", label: "Event/job plural" },
  { key: "assetSingular", label: "Asset/equipment singular" },
  { key: "assetPlural", label: "Asset/equipment plural" },
  { key: "taskSingular", label: "Task singular" },
  { key: "taskPlural", label: "Task plural" },
  { key: "certificationSingular", label: "Certification singular" },
  { key: "certificationPlural", label: "Certification plural" },
  { key: "sponsorSingular", label: "Sponsor/supporter singular" },
  { key: "sponsorPlural", label: "Sponsor/supporter plural" },
  { key: "registrationPlural", label: "Registration plural" },
  { key: "gradingSingular", label: "Grading label" },
];

function ProfileSettingsTab() {
  const profile = useQuery(api.organizations.profile, {});
  const templates = useQuery(api.organizations.verticalTemplates, {});
  const updateProfile = useMutation(api.organizations.updateProfile);
  const setModule = useMutation(api.organizations.setModule);
  const [templateKey, setTemplateKey] = React.useState("sports_club");
  const [kind, setKind] = React.useState<OrganizationKind>("sports_club");
  const [sportKey, setSportKey] = React.useState<SportKey | undefined>(
    "multi_sport",
  );
  const [terms, setTerms] =
    React.useState<OrganizationTerminology>(DEFAULT_TERMINOLOGY);
  const [saving, setSaving] = React.useState(false);
  const [moduleBusy, setModuleBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!profile) return;
    setTemplateKey(profile.templateKey);
    setKind(profile.kind);
    setSportKey(profile.sportKey);
    setTerms({ ...DEFAULT_TERMINOLOGY, ...profile.terminology });
  }, [profile]);

  if (!profile || !templates) return <LoadingState />;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ kind, templateKey, sportKey, terminology: terms });
      toastSuccess("Organisation profile saved.");
    } catch (err) {
      toastFailure(err, "Could not save organisation profile.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleModule(key: OrganizationModuleKey, enabled: boolean) {
    setModuleBusy(key);
    try {
      await setModule({ key, enabled });
      toastSuccess(
        `${MODULE_LABELS[key]} ${enabled ? "enabled" : "disabled"}.`,
      );
    } catch (err) {
      toastFailure(err, "Could not update module.");
    } finally {
      setModuleBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile and terminology</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Template</Label>
                <Select
                  value={templateKey}
                  onValueChange={(value) => {
                    const selected = templates.find((row) => row.key === value);
                    setTemplateKey(value);
                    if (selected) {
                      setKind(selected.kind);
                      setSportKey(selected.sportKey as SportKey | undefined);
                      setTerms({
                        ...DEFAULT_TERMINOLOGY,
                        ...selected.terminology,
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.key} value={template.key}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Organisation type</Label>
                <Input value={humanise(kind)} readOnly />
              </div>
              {sportKey && (
                <div className="grid gap-1.5">
                  <Label>Sport pack</Label>
                  <Input value={humanise(sportKey)} readOnly />
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {TERMINOLOGY_FIELDS.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <Label htmlFor={`term-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`term-${field.key}`}
                    value={terms[field.key] ?? ""}
                    onChange={(event) =>
                      setTerms((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>

            <div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enabled modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {profile.modules.map((module) => {
              const locked = module.key === "core" || module.key === "people";
              return (
                <div
                  key={module.key}
                  className="flex items-center justify-between gap-3 rounded-sm border border-hairline bg-surface px-3 py-2"
                >
                  <div>
                    <p className="text-body-strong">
                      {MODULE_LABELS[module.key]}
                    </p>
                    <p className="text-caption text-ink-quiet">
                      {module.enabled
                        ? "Visible and active"
                        : "Hidden and gated"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={module.enabled ? "outline" : "default"}
                    disabled={locked || moduleBusy === module.key}
                    onClick={() => toggleModule(module.key, !module.enabled)}
                  >
                    {module.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LocationSettingsTab() {
  const { org } = useGatherHub();
  const update = useMutation(api.organizations.updateLocationSettings);
  const [defaultAddress, setDefaultAddress] = React.useState(
    org?.defaultAddress ?? "",
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDefaultAddress(org?.defaultAddress ?? "");
  }, [org?.id, org?.defaultAddress]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await update({
        defaultAddress: defaultAddress.trim() || undefined,
      });
      setSaved(true);
      toastSuccess("Default address saved.");
    } catch (err) {
      setError(toastFailure(err, "Could not save default address."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Location defaults
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-default-address">
              Default organisation address
            </Label>
            <AddressAutocompleteInput
              id="org-default-address"
              value={defaultAddress}
              onChange={setDefaultAddress}
              showDefaultAction={false}
              showLookupHint
            />
            <p className="text-caption text-ink-quiet">
              Used as the starting location for new assets, events, and asset
              movements when a specific location is not entered.
            </p>
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save default address"}
            </Button>
            {saved && <span className="text-sm text-success">Saved</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Clerk-native email invitations plus a Convex-native shareable invite code.
 * Committee+ only; server functions enforce the same gates.
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

type ConfiguredRole = {
  id: Id<"organizationRoles"> | null;
  key: string;
  displayName: string;
  description?: string;
  legacyRole: Role;
  capabilities: Capability[];
  isSystem: boolean;
  active: boolean;
  order: number;
};

function defaultInviteRole(roles: ConfiguredRole[]): ConfiguredRole | null {
  return (
    roles.find((role) => role.key === "player") ??
    roles.find((role) => role.legacyRole !== "owner") ??
    roles[0] ??
    null
  );
}

function SendInviteCard() {
  const send = useAction(api.invitations.send);
  const configured = useQuery(api.roles.listConfigured);
  const [email, setEmail] = React.useState("");
  const [roleKey, setRoleKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const roles = React.useMemo(
    () => (configured?.roles ?? []) as ConfiguredRole[],
    [configured?.roles],
  );
  const selectedRole =
    roles.find((role) => role.key === roleKey) ?? defaultInviteRole(roles);

  React.useEffect(() => {
    if (!roleKey && roles.length > 0) {
      setRoleKey(defaultInviteRole(roles)?.key ?? "");
    }
  }, [roleKey, roles]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRole) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await send({
        email: email.trim(),
        role: selectedRole.legacyRole,
        roleKey: selectedRole.key,
      });
      setMessage(`Invitation sent to ${email.trim()}.`);
      toastSuccess(`Invitation sent to ${email.trim()}.`);
      setEmail("");
      setRoleKey(defaultInviteRole(roles)?.key ?? "");
    } catch (err) {
      setError(toastFailure(err, "Could not send invite."));
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
        <form
          onSubmit={submit}
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        >
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
            <Select value={selectedRole?.key ?? ""} onValueChange={setRoleKey}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.key} value={role.key}>
                    {role.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={busy || !email.trim() || !selectedRole}
          >
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </form>
        {message && <p className="mt-3 text-sm text-success">{message}</p>}
        {error && <p className="mt-3 text-caption text-danger">{error}</p>}
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
      toastSuccess("Invite code rotated.");
    } catch (err) {
      toastFailure(err, "Could not rotate invite code.");
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
          Anyone signed in with this code can join as a Player. Rotate to
          invalidate the previous code.
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
  // Clerk-native invitations live on Clerk's side; the list action
  // fetches them on demand and isn't a reactive query.
  const list = useAction(api.invitations.list);
  const revoke = useAction(api.invitations.revoke);
  const remove = useAction(api.invitations.remove);
  const [invites, setInvites] = React.useState<
    Awaited<ReturnType<typeof list>> | undefined
  >(undefined);

  const refresh = React.useCallback(async () => {
    setInvites(await list({}));
  }, [list]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (invites === undefined) return <LoadingState />;
  if (invites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No invitations sent yet.
          </p>
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
                  <Badge variant="secondary">
                    {i.roleDisplayName ?? humanise(i.roleKey ?? i.role)}
                  </Badge>
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
                  <div className="flex items-center justify-end gap-1">
                    {i.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await revoke({ invitationId: i.id });
                            await refresh();
                            toastSuccess(`Invitation revoked for ${i.email}.`);
                          } catch (err) {
                            toastFailure(err, "Could not revoke invitation.");
                          }
                        }}
                        title="Revoke this Clerk invitation"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {i.status !== "accepted" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (
                            confirm(`Revoke the invitation for ${i.email}?`)
                          ) {
                            try {
                              await remove({ invitationId: i.id });
                              await refresh();
                              toastSuccess(
                                `Invitation removed for ${i.email}.`,
                              );
                            } catch (err) {
                              toastFailure(err, "Could not remove invitation.");
                            }
                          }
                        }}
                        title="Revoke"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
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
  const { role: currentRole } = useGatherHub();
  const members = useQuery(api.roles.listMembers);
  const configured = useQuery(api.roles.listConfigured);
  const updateRole = useMutation(api.roles.updateRole);
  const [error, setError] = React.useState<string | null>(null);
  const roles = (configured?.roles ?? []) as ConfiguredRole[];

  async function change(membershipId: Id<"memberships">, roleKey: string) {
    const role = roles.find((row) => row.key === roleKey);
    if (!role) return;
    setError(null);
    try {
      await updateRole({
        membershipId,
        role: role.legacyRole,
        roleKey: role.key,
      });
      toastSuccess("Role updated.");
    } catch (e) {
      setError(toastFailure(e, "Could not update role."));
    }
  }

  if (members === undefined || configured === undefined)
    return <LoadingState />;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Members & roles</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-caption text-danger">{error}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Capabilities</TableHead>
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
                      value={m.roleKey ?? m.role}
                      onValueChange={(value) => change(m.membershipId, value)}
                      disabled={m.role === "owner" && currentRole !== "owner"}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem
                            key={role.key}
                            value={role.key}
                            disabled={
                              role.legacyRole === "owner" &&
                              currentRole !== "owner"
                            }
                          >
                            {role.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.capabilities.length}
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
      {currentRole === "owner" && (
        <RoleDesigner
          roles={roles}
          capabilities={configured.capabilities ?? []}
        />
      )}
    </div>
  );
}

function RoleDesigner({
  roles,
  capabilities,
}: {
  roles: ConfiguredRole[];
  capabilities: readonly Capability[];
}) {
  const upsertRole = useMutation(api.roles.upsertConfigured);
  const [selectedKey, setSelectedKey] = React.useState(roles[0]?.key ?? "");
  const selected = roles.find((role) => role.key === selectedKey) ?? roles[0];
  const [displayName, setDisplayName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [legacyRole, setLegacyRole] = React.useState<Role>("volunteer");
  const [selectedCapabilities, setSelectedCapabilities] = React.useState<
    Capability[]
  >([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selected) return;
    setDisplayName(selected.displayName);
    setDescription(selected.description ?? "");
    setLegacyRole(selected.legacyRole);
    setSelectedCapabilities(selected.capabilities);
  }, [selected]);

  function toggleCapability(capability: Capability, checked: boolean) {
    setSelectedCapabilities((current) =>
      checked
        ? [...new Set([...current, capability])]
        : current.filter((value) => value !== capability),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await upsertRole({
        key: selected.key,
        displayName,
        description: description.trim() || undefined,
        legacyRole,
        capabilities: selectedCapabilities,
        active: true,
      });
      toastSuccess("Role saved.");
    } catch (err) {
      setError(toastFailure(err, "Could not save role."));
    } finally {
      setSaving(false);
    }
  }

  if (!selected) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configured role templates</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={selected.key} onValueChange={setSelectedKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="role-display-name">Display name</Label>
              <Input
                id="role-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Base role</Label>
              <Select
                value={legacyRole}
                onValueChange={(value) => setLegacyRole(value as Role)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {humanise(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {capabilities.map((capability) => (
              <label
                key={capability}
                className="flex items-start gap-2 rounded-sm border border-hairline bg-surface px-3 py-2 text-body"
              >
                <input
                  type="checkbox"
                  checked={selectedCapabilities.includes(capability)}
                  onChange={(event) =>
                    toggleCapability(capability, event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>{CAPABILITY_LABELS[capability] ?? capability}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
          <div>
            <Button type="submit" disabled={saving || !displayName.trim()}>
              {saving ? "Saving..." : "Save role"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type TaxonomyKind =
  | "event_type"
  | "asset_category"
  | "asset_condition"
  | "team_age_group";

const KIND_LABEL: Record<TaxonomyKind, string> = {
  event_type: "Event types",
  asset_category: "Asset categories",
  asset_condition: "Asset conditions",
  team_age_group: "Team age groups",
};

const KIND_DESCRIPTION: Record<TaxonomyKind, string> = {
  event_type:
    "What kinds of events your organisation runs. Used in the Events create dialog and visible as a chip on each event row.",
  asset_category:
    "Categories you sort tracked items into in KitTrace. Used in the asset create dialog and as a filter on the assets list.",
  asset_condition:
    "Condition scale for tracked items. Used in the asset detail view and reports.",
  team_age_group:
    "Age groups available when creating a team. Used in the team create dialog.",
};

const KINDS: TaxonomyKind[] = [
  "event_type",
  "asset_category",
  "asset_condition",
  "team_age_group",
];

function TaxonomiesTab() {
  return (
    <Tabs defaultValue="event_type">
      <TabsList className="flex-wrap">
        {KINDS.map((k) => (
          <TabsTrigger key={k} value={k}>
            {KIND_LABEL[k]}
          </TabsTrigger>
        ))}
      </TabsList>
      {KINDS.map((k) => (
        <TabsContent key={k} value={k}>
          <TaxonomyEditor kind={k} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TaxonomyEditor({ kind }: { kind: TaxonomyKind }) {
  const rows = useQuery(api.taxonomies.list, { kind, includeInactive: true });
  const create = useMutation(api.taxonomies.create);
  const updateRow = useMutation(api.taxonomies.update);
  const setActive = useMutation(api.taxonomies.setActive);
  const setDefault = useMutation(api.taxonomies.setDefault);
  const reorder = useMutation(api.taxonomies.reorder);

  const [newLabel, setNewLabel] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError(null);
    setAdding(true);
    try {
      await create({ kind, label: newLabel.trim() });
      setNewLabel("");
      toastSuccess("List item added.");
    } catch (err) {
      setError(toastFailure(err, "Could not add list item."));
    } finally {
      setAdding(false);
    }
  }

  async function move(id: Id<"taxonomies">, direction: -1 | 1) {
    if (!rows) return;
    const active = rows.filter((r) => r.active);
    const idx = active.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= active.length) return;
    const reorderedActive = [...active];
    const [moved] = reorderedActive.splice(idx, 1);
    if (!moved) return;
    reorderedActive.splice(nextIdx, 0, moved);
    const inactive = rows.filter((r) => !r.active);
    setError(null);
    try {
      await reorder({
        kind,
        orderedIds: [...reorderedActive, ...inactive].map((r) => r.id),
      });
      toastSuccess("List order updated.");
    } catch (err) {
      setError(toastFailure(err, "Could not reorder list."));
    }
  }

  async function runTaxonomyAction(
    action: () => Promise<unknown>,
    success: string,
    fallback: string,
  ) {
    setError(null);
    try {
      await action();
      toastSuccess(success);
    } catch (err) {
      setError(toastFailure(err, fallback));
    }
  }

  if (rows === undefined) return <LoadingState />;

  const active = rows.filter((r) => r.active);
  const inactive = rows.filter((r) => !r.active);

  return (
    <div className="grid gap-4">
      <p className="max-w-prose text-body text-ink-soft">
        {KIND_DESCRIPTION[kind]} Items here become the choices in dropdowns
        across the app.
      </p>

      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-hairline">
          <h3 className="text-title text-ink-strong">In use</h3>
          <span className="text-caption text-ink-quiet">
            <span data-numeric className="font-medium text-ink-soft">
              {active.length}
            </span>{" "}
            active
          </span>
        </header>
        {active.length === 0 ? (
          <div className="px-5 py-6 text-body text-ink-quiet">
            No active items yet.
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {active.map((row, idx) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5"
              >
                <InlineLabelEditor
                  initial={row.label}
                  onSave={(label) => updateRow({ id: row.id, label })}
                />
                <code className="text-mono text-ink-quiet">{row.key}</code>
                {row.isDefault && (
                  <Badge variant="accent" withDot>
                    Default
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Move up"
                    disabled={idx === 0}
                    onClick={() => move(row.id, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Move down"
                    disabled={idx === active.length - 1}
                    onClick={() => move(row.id, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={row.isDefault ? "Default item" : "Set as default"}
                    onClick={() =>
                      runTaxonomyAction(
                        () => setDefault({ id: row.id }),
                        "Default list item updated.",
                        "Could not update default list item.",
                      )
                    }
                    disabled={row.isDefault}
                  >
                    <Star
                      className={`h-4 w-4 ${row.isDefault ? "fill-primary text-primary" : ""}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Deactivate"
                    onClick={() =>
                      runTaxonomyAction(
                        () => setActive({ id: row.id, active: false }),
                        "List item hidden.",
                        "Could not hide list item.",
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={add}
          className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-hairline bg-surface-sunk/30"
        >
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={`Add a new ${KIND_LABEL[kind].toLowerCase().replace(/s$/, "")}`}
            className="max-w-xs"
            aria-label={`New ${KIND_LABEL[kind]} label`}
          />
          <Button type="submit" disabled={adding || !newLabel.trim()}>
            <Plus className="h-4 w-4" />
            {adding ? "Adding…" : "Add"}
          </Button>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
      </section>

      {inactive.length > 0 && (
        <section className="rounded-md border border-hairline bg-surface-sunk/40 overflow-hidden">
          <header className="px-4 py-2.5 border-b border-hairline">
            <h3 className="text-title text-ink-strong">Hidden</h3>
            <p className="text-caption text-ink-quiet mt-0.5">
              Records using these labels still render. Hidden items are not
              shown in create dropdowns.
            </p>
          </header>
          <ul className="divide-y divide-hairline">
            {inactive.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5"
              >
                <span className="text-body text-ink-quiet">{row.label}</span>
                <code className="text-mono text-ink-quiet">{row.key}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    runTaxonomyAction(
                      () => setActive({ id: row.id, active: true }),
                      "List item restored.",
                      "Could not restore list item.",
                    )
                  }
                >
                  <RotateCw className="h-4 w-4" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InlineLabelEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (label: string) => Promise<unknown>;
}) {
  const [value, setValue] = React.useState(initial);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setValue(initial);
  }, [initial, editing]);

  async function commit() {
    if (value === initial) {
      setEditing(false);
      return;
    }
    if (!value.trim()) {
      setValue(initial);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(value.trim());
      toastSuccess("List item renamed.");
    } catch (err) {
      toastFailure(err, "Could not rename list item.");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-body-strong text-ink-strong hover:text-primary text-left focus-visible:outline-none focus-visible:shadow-focus rounded-xs"
      >
        {initial}
      </button>
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setValue(initial);
          setEditing(false);
        }
      }}
      disabled={saving}
      autoFocus
      className="max-w-[200px] h-7"
    />
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
      toastSuccess("Public website settings saved.");
    } catch (e) {
      setError(toastFailure(e, "Could not save public website settings."));
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
            <LocationInput
              id="addr"
              value={form.address}
              onChange={(address) => setForm({ ...form, address })}
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
        {error && <p className="text-caption text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save}>Save settings</Button>
          {saved && <span className="text-sm text-success">Saved ✓</span>}
        </div>
      </CardContent>
    </Card>
  );
}
