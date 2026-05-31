/* eslint-disable react-refresh/only-export-components */
import { SignIn } from "@clerk/clerk-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/pages/auth/AuthShell";

export default function SignInPage() {
  const [params] = useSearchParams();
  const ticket = params.get("__clerk_ticket") ?? params.get("ticket");
  const redirect = params.get("redirect_url") ?? "/";
  const email = params.get("email") ?? "";

  if (ticket) {
    const signUpParams = new URLSearchParams(params);
    signUpParams.set("__clerk_ticket", ticket);
    signUpParams.delete("ticket");
    return <Navigate to={`/sign-up?${signUpParams}`} replace />;
  }

  return (
    <AuthShell heading="Sign in" caption="Welcome back.">
      <SignIn
        routing="path"
        path="/sign-in"
        forceRedirectUrl={redirect}
        fallbackRedirectUrl={redirect}
        initialValues={email ? { emailAddress: email } : undefined}
        appearance={CLERK_APPEARANCE}
      />
    </AuthShell>
  );
}

export const CLERK_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    card: "shadow-none border-0 bg-transparent w-full",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    formButtonPrimary:
      "bg-primary hover:bg-primary-hover active:bg-primary-active text-primary-foreground rounded-sm h-9 font-semi text-body",
    formFieldInput:
      "rounded-sm border border-hairline bg-surface text-body text-ink hover:border-border-strong focus:border-primary",
    socialButtonsBlockButton:
      "rounded-sm border border-hairline bg-surface text-body text-ink hover:bg-surface-sunk",
    footerActionLink: "text-primary hover:text-primary-hover font-semi",
  },
};
