import * as React from "react";
import { Link } from "react-router-dom";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { Building2, ShieldOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { parseAuthError, type AuthErrorCode } from "@/lib/errors";

/**
 * Renders the right screen for any auth-related error thrown by a Convex
 * function — sign-in CTA, organisation switcher, or a plain access denied.
 *
 * Intentionally does NOT echo the backend message verbatim for the
 * `not_found`/`forbidden` cases, so a probe cannot tell whether a record
 * exists in another org vs. is genuinely missing.
 */
export function AccessDenied({ error }: { error: unknown }) {
  const parsed = parseAuthError(error);
  const code: AuthErrorCode = parsed?.code ?? "forbidden";

  switch (code) {
    case "unauthenticated":
      return (
        <EmptyState
          icon={LogIn}
          title="Please sign in"
          description="Your session has expired or you are not signed in."
          action={
            <Button asChild>
              <Link to="/sign-in">Sign in</Link>
            </Button>
          }
        />
      );

    case "no_active_org":
      return <NoOrganisation />;

    case "not_member":
      return (
        <EmptyState
          icon={Building2}
          title="You are not a member of this organisation"
          description="Switch organisation or ask an admin to invite you with a code."
          action={<OrgSwitcher />}
        />
      );

    case "not_found":
    case "forbidden":
    default:
      return (
        <EmptyState
          icon={ShieldOff}
          title="Access denied"
          description="You do not have permission to view this. If you think this is wrong, ask an admin to update your role."
        />
      );
  }
}

/** Standalone empty-org screen, also used by AppLayout. */
export function NoOrganisation() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState
        icon={Building2}
        title="Select or create an organisation"
        description="Use the organisation switcher in the top bar to create a new organisation or select an existing one."
        action={<OrgSwitcher />}
      />
    </div>
  );
}

/**
 * Error boundary that catches Convex `ConvexError`s thrown during render
 * (e.g. via `useQuery` returning a typed error in suspense mode) and routes
 * them to `<AccessDenied>`. Non-auth errors are re-thrown so the global
 * boundary handles them.
 */
export class AuthErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: unknown }
> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      const parsed = parseAuthError(this.state.error);
      if (parsed) return <AccessDenied error={this.state.error} />;
      throw this.state.error;
    }
    return this.props.children;
  }
}
