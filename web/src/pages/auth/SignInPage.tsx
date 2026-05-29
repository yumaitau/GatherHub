import { SignIn } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";

export default function SignInPage() {
  const [params] = useSearchParams();
  const redirect = params.get("redirect_url") ?? "/";
  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(redirect)}`}
        afterSignInUrl={redirect}
        afterSignUpUrl={redirect}
      />
    </div>
  );
}
