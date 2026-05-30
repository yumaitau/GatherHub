import { SignUp } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { AuthShell } from "@/pages/auth/AuthShell";
import { CLERK_APPEARANCE } from "@/pages/auth/SignInPage";

export default function SignUpPage() {
  const [params] = useSearchParams();
  const redirect = params.get("redirect_url") ?? "/";
  return (
    <AuthShell
      heading="Create your account"
      caption="Run your club operations on GatherHub."
    >
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl={`/sign-in?redirect_url=${encodeURIComponent(redirect)}`}
        afterSignInUrl={redirect}
        afterSignUpUrl={redirect}
        appearance={CLERK_APPEARANCE}
      />
    </AuthShell>
  );
}
