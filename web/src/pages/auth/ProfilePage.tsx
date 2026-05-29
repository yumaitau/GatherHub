import { UserProfile, useOrganizationList } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageHeader, LoadingState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/**
 * /profile — the signed-in user's account screen.
 *
 * Personal account fields (name, avatar, email, password) are delegated to
 * Clerk's `<UserProfile>` since Clerk is the source of truth for identity. The
 * GatherHub-specific view below shows every organisation membership and role,
 * which only exists in Convex.
 */
export default function ProfilePage() {
  return (
    <div>
      <PageHeader
        title="Your profile"
        description="Account details, security, and your organisation memberships."
      />
      <div className="grid gap-6">
        <MembershipsCard />
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Clerk-managed account UI: name, avatar, email, password, MFA. */}
            <UserProfile path="/profile" routing="path" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MembershipsCard() {
  const memberships = useQuery(api.sync.myMemberships);
  const { setActive, isLoaded } = useOrganizationList();

  if (memberships === undefined) return <LoadingState />;

  async function switchTo(clerkOrgId: string) {
    if (!isLoaded || !setActive) return;
    await setActive({ organization: clerkOrgId });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation memberships</CardTitle>
      </CardHeader>
      <CardContent>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not a member of any organisation yet. Accept an invite from
            an admin or create your own club from the organisation switcher.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Club</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((m) => (
                <TableRow key={m.membershipId}>
                  <TableCell className="font-medium">
                    {m.org?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{humanise(m.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    {m.org && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => switchTo(m.org!.clerkOrgId)}
                      >
                        Switch to
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
