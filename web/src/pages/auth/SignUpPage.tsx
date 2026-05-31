import * as React from "react";
import { useSignUp, useUser } from "@clerk/clerk-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/pages/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Invitation-only sign-up. Clerk's "restricted" mode blocks self-serve
 * signups; this page exists solely to consume `__clerk_ticket` from
 * invitation links (Clerk redirects the hosted /v1/tickets/accept
 * endpoint here with the ticket appended). Without a ticket we bounce
 * to /sign-in so randoms can't land here.
 */
export default function SignUpPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const { isLoaded, signUp, setActive } = useSignUp();
  const ticket = params.get("__clerk_ticket") ?? params.get("ticket");
  const redirect = safeRedirect(params.get("redirect_url"));
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isSignedIn) {
      navigate(redirect, { replace: true });
    }
  }, [isSignedIn, navigate, redirect]);

  if (!ticket) {
    return <Navigate to="/sign-in" replace />;
  }
  const invitationTicket = ticket;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;

    setBusy(true);
    setError(null);
    try {
      const signUpAttempt = await signUp.create({
        strategy: "ticket",
        ticket: invitationTicket,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });

      if (signUpAttempt.status !== "complete") {
        setError(
          "This invitation needs another account setup step before it can be completed.",
        );
        return;
      }
      if (!signUpAttempt.createdSessionId) {
        setError(
          "Your account was created, but Clerk did not return a session.",
        );
        return;
      }

      await setActive({ session: signUpAttempt.createdSessionId });
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      heading="Accept your invitation"
      caption="Finish setting up your GatherHub account."
    >
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div id="clerk-captcha" />
        {error && <p className="text-caption text-danger">{error}</p>}
        <Button
          type="submit"
          disabled={
            busy ||
            !isLoaded ||
            !firstName.trim() ||
            !lastName.trim() ||
            !password
          }
        >
          {busy ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

function safeRedirect(value: string | null): string {
  if (!value) return "/";
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const url = new URL(value);
    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Fall through to the default.
  }
  return "/";
}

function clerkErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "errors" in err &&
    Array.isArray((err as { errors?: unknown }).errors)
  ) {
    const first = (err as { errors: unknown[] }).errors[0] as
      | {
          longMessage?: string;
          long_message?: string;
          message?: string;
        }
      | undefined;
    return (
      first?.longMessage ??
      first?.long_message ??
      first?.message ??
      "Could not create the account from this invitation."
    );
  }

  return err instanceof Error
    ? err.message
    : "Could not create the account from this invitation.";
}
