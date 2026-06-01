import * as React from "react";
import { UserProfile, useUser } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageHeader, LoadingState } from "@/components/shared";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { humanise } from "@/lib/utils";

export default function ProfilePage() {
  return (
    <div>
      <PageHeader
        title="Your profile"
        description="Account details, security, and your organisation memberships."
      />
      <div className="grid gap-6">
        <NamePanel />
        <MembershipsPanel />
        <section className="rounded-md border border-hairline bg-surface overflow-hidden">
          <header className="px-5 py-3 border-b border-hairline">
            <h2 className="text-title text-ink-strong">Account</h2>
            <p className="text-caption text-ink-quiet mt-0.5">
              Identity (name, avatar, email, password, MFA) is managed by Clerk.
            </p>
          </header>
          <div className="px-2 py-2">
            <UserProfile path="/profile" routing="path" />
          </div>
        </section>
      </div>
    </div>
  );
}

function NamePanel() {
  const { user: appUser } = useGatherHub();
  const { isLoaded, user: clerkUser } = useUser();
  const ensureFromClerk = useAction(api.syncClerk.ensureFromClerk);
  const initialFirstName = clerkUser?.firstName ?? appUser?.firstName ?? "";
  const initialLastName = clerkUser?.lastName ?? appUser?.lastName ?? "";
  const [firstName, setFirstName] = React.useState(initialFirstName);
  const [lastName, setLastName] = React.useState(initialLastName);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFirstName(initialFirstName);
    setLastName(initialLastName);
  }, [initialFirstName, initialLastName]);

  const nextFirstName = firstName.trim();
  const nextLastName = lastName.trim();
  const hasChanges =
    nextFirstName !== initialFirstName || nextLastName !== initialLastName;
  const canSave =
    isLoaded &&
    !!clerkUser &&
    hasChanges &&
    !!nextFirstName &&
    !!nextLastName &&
    !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clerkUser || !canSave) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await clerkUser.update({
        firstName: nextFirstName,
        lastName: nextLastName,
      });
      await clerkUser.reload();
      await ensureFromClerk({});
      setMessage("Name updated.");
      toastSuccess("Name updated.");
    } catch (err) {
      setError(toastFailure(err, "Your name could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="px-5 py-3 border-b border-hairline">
        <h2 className="text-title text-ink-strong">Display name</h2>
        <p className="text-caption text-ink-quiet mt-0.5">
          Used for greetings, audit entries, and organisation activity.
        </p>
      </header>
      <form onSubmit={submit} className="px-5 py-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="profile-first-name">First name</Label>
            <Input
              id="profile-first-name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setMessage(null);
                setError(null);
              }}
              autoComplete="given-name"
              disabled={!isLoaded || busy}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="profile-last-name">Last name</Label>
            <Input
              id="profile-last-name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setMessage(null);
                setError(null);
              }}
              autoComplete="family-name"
              disabled={!isLoaded || busy}
              required
            />
          </div>
          <Button type="submit" disabled={!canSave}>
            {busy ? "Saving..." : "Save name"}
          </Button>
        </div>
        <div className="mt-2 min-h-5">
          {error ? (
            <p className="text-caption text-danger">{error}</p>
          ) : message ? (
            <p className="text-caption text-success">{message}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function MembershipsPanel() {
  const memberships = useQuery(api.sync.myMemberships);
  const setActive = useMutation(api.organizations.setActive);

  if (memberships === undefined) return <LoadingState />;

  async function switchTo(orgId: Id<"organizations">) {
    try {
      await setActive({ orgId });
      toastSuccess("Organisation switched.");
    } catch (err) {
      toastFailure(err, "Could not switch organisation.");
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-hairline">
        <h2 className="text-title text-ink-strong">Organisation memberships</h2>
        {memberships.length > 0 && (
          <span className="text-caption text-ink-quiet">
            <span data-numeric className="font-medium text-ink-soft">
              {memberships.length}
            </span>{" "}
            {memberships.length === 1 ? "club" : "clubs"}
          </span>
        )}
      </header>
      {memberships.length === 0 ? (
        <div className="px-5 py-8">
          <p className="text-body text-ink-soft max-w-prose">
            You are not a member of any organisation yet. Accept an invite from
            a committee member or create your own organisation from the
            switcher.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberships.map((m) => (
              <TableRow key={m.membershipId}>
                <TableCell className="font-semi text-ink-strong">
                  {m.org?.name ?? "Unknown"}
                </TableCell>
                <TableCell>
                  <Badge variant="muted">{humanise(m.role)}</Badge>
                </TableCell>
                <TableCell>
                  {m.org && !m.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => switchTo(m.org!.id as Id<"organizations">)}
                    >
                      Switch to
                    </Button>
                  )}
                  {m.isActive && <Badge variant="accent">Active</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
