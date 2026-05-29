import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, Mail } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/shared";
import { humanise } from "@/lib/utils";

/**
 * /invite/:code — landing page for an emailed organisation invitation.
 *
 * If the visitor is signed out we route them through Clerk sign-up/sign-in
 * with the code preserved in the redirect URL. Once signed in we surface the
 * invitation details and let them accept, which adds a membership and sets
 * the org active.
 */
export default function AcceptInvitePage() {
  const { code = "" } = useParams<{ code: string }>();
  const preview = useQuery(api.invitations.preview, code ? { code } : "skip");
  const signInTarget = `/sign-in?redirect_url=${encodeURIComponent(`/invite/${code}`)}`;
  const signUpTarget = `/sign-up?redirect_url=${encodeURIComponent(`/invite/${code}`)}`;

  if (!code) return <InvalidCard />;
  if (preview === undefined) return <LoadingState label="Loading invitation…" />;

  if (preview.status !== "pending") {
    return (
      <Centered>
        <EmptyState
          icon={Mail}
          title={
            preview.status === "expired"
              ? "Invitation expired"
              : preview.status === "accepted"
                ? "Invitation already used"
                : preview.status === "revoked"
                  ? "Invitation revoked"
                  : "Invitation not found"
          }
          description="Ask an admin to send you a new invite."
          action={
            <Button asChild>
              <Link to="/">Back to GatherHub</Link>
            </Button>
          }
        />
      </Centered>
    );
  }

  return (
    <Centered>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Join {preview.orgName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ve been invited to join <strong>{preview.orgName}</strong>{" "}
            as <strong>{humanise(preview.role)}</strong>. The invite was sent to{" "}
            <strong>{preview.email}</strong>.
          </p>
          <SignedOut>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link to={signUpTarget}>Create an account to accept</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={signInTarget}>I already have an account</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Make sure to use {preview.email} when signing in or up — the
              invitation is locked to that address.
            </p>
          </SignedOut>
          <SignedIn>
            <AcceptControls code={code} expectedEmail={preview.email} />
          </SignedIn>
        </CardContent>
      </Card>
    </Centered>
  );
}

function AcceptControls({
  code,
  expectedEmail,
}: {
  code: string;
  expectedEmail: string;
}) {
  const { user, isLoaded } = useUser();
  const accept = useMutation(api.invitations.accept);
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const userEmail = (user?.primaryEmailAddress?.emailAddress ?? "")
    .trim()
    .toLowerCase();
  const wrongAccount = isLoaded && userEmail && userEmail !== expectedEmail;

  async function onAccept() {
    setBusy(true);
    setError(null);
    try {
      await accept({ code });
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not accept invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded) return <LoadingState />;

  if (wrongAccount) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          You&apos;re signed in as <strong>{userEmail}</strong>, but this
          invite is for <strong>{expectedEmail}</strong>. Sign out and sign in
          with the invited email to accept.
        </p>
        <Button asChild variant="outline">
          <Link to="/sign-in">Switch account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={onAccept} disabled={busy} className="w-full">
        <Check className="h-4 w-4" />
        {busy ? "Accepting…" : "Accept invitation"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      {children}
    </div>
  );
}

function InvalidCard() {
  return (
    <Centered>
      <EmptyState
        icon={Mail}
        title="No invitation code"
        description="The link you followed is missing a code."
      />
    </Centered>
  );
}
