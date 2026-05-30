/* eslint-disable react-refresh/only-export-components */
import { SignIn } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { AuthShell } from "@/pages/auth/AuthShell";

export default function SignInPage() {
  const [params] = useSearchParams();
  const redirect = params.get("redirect_url") ?? "/";
  return (
    <AuthShell heading="Sign in" caption="Welcome back.">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(redirect)}`}
        afterSignInUrl={redirect}
        afterSignUpUrl={redirect}
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
