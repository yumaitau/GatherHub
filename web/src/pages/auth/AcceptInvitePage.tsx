import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, Mail } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/shared";
import { AuthShell } from "@/pages/auth/AuthShell";
import { humanise } from "@/lib/utils";

/**
 * /invite/:code — landing page for an emailed organisation invitation.
 */
export default function AcceptInvitePage() {
  const { code = "" } = useParams<{ code: string }>();
  const preview = useQuery(api.invitations.preview, code ? { code } : "skip");
  const signInTarget = `/sign-in?redirect_url=${encodeURIComponent(`/invite/${code}`)}`;
  const signUpTarget = `/sign-up?redirect_url=${encodeURIComponent(`/invite/${code}`)}`;

  if (!code) {
    return (
      <AuthShell heading="No invitation code">
        <EmptyState
          icon={Mail}
          title="No invitation code"
          description="The link you followed is missing a code."
        />
      </AuthShell>
    );
  }

  if (preview === undefined) {
    return (
      <AuthShell heading="Loading invitation">
        <LoadingState label="Loading invitation…" />
      </AuthShell>
    );
  }

  if (preview.status !== "pending") {
    const title =
      preview.status === "expired"
        ? "Invitation expired"
        : preview.status === "accepted"
          ? "Invitation already used"
          : preview.status === "revoked"
            ? "Invitation revoked"
            : "Invitation not found";
    return (
      <AuthShell heading={title}>
        <EmptyState
          icon={Mail}
          title={title}
          description="Ask an admin to send you a new invite."
          action={
            <Button asChild>
              <Link to="/">Back to GatherHub</Link>
            </Button>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={`Join ${preview.orgName}`}
      caption={`Invited as ${humanise(preview.role)} (${preview.email}).`}
    >
      <div className="rounded-md border border-hairline bg-surface px-5 py-5">
        <div className="flex items-center gap-3 pb-4 border-b border-hairline">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-primary-wash"
            aria-hidden="true"
          >
            <Building2 className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-body-strong text-ink-strong truncate">
              {preview.orgName}
            </p>
            <p className="text-caption text-ink-quiet">
              You will join as {humanise(preview.role)}
            </p>
          </div>
        </div>

        <SignedOut>
          <div className="flex flex-col gap-2 pt-4">
            <Button asChild>
              <Link to={signUpTarget}>Create an account to accept</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={signInTarget}>I already have an account</Link>
            </Button>
          </div>
          <p className="mt-3 text-caption text-ink-quiet max-w-prose">
            Use {preview.email} when signing in or up; the invitation is locked
            to that address.
          </p>
        </SignedOut>
        <SignedIn>
          <div className="pt-4">
            <AcceptControls code={code} expectedEmail={preview.email} />
          </div>
        </SignedIn>
      </div>
    </AuthShell>
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
        <p className="text-body text-danger">
          You are signed in as <strong>{userEmail}</strong>, but this invite is
          for <strong>{expectedEmail}</strong>. Sign out and sign in with the
          invited email to accept.
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
      {error && <p className="text-caption text-danger">{error}</p>}
    </div>
  );
}
