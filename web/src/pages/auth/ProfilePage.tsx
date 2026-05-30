import { UserProfile } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
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
import { humanise } from "@/lib/utils";

export default function ProfilePage() {
  return (
    <div>
      <PageHeader
        title="Your profile"
        description="Account details, security, and your organisation memberships."
      />
      <div className="grid gap-6">
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

function MembershipsPanel() {
  const memberships = useQuery(api.sync.myMemberships);
  const setActive = useMutation(api.organizations.setActive);

  if (memberships === undefined) return <LoadingState />;

  async function switchTo(orgId: Id<"organizations">) {
    await setActive({ orgId });
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
            an admin or create your own organisation from the switcher.
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
