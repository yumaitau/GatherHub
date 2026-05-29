import { SignUp } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";

export default function SignUpPage() {
  const [params] = useSearchParams();
  const redirect = params.get("redirect_url") ?? "/";
  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl={`/sign-in?redirect_url=${encodeURIComponent(redirect)}`}
        afterSignInUrl={redirect}
        afterSignUpUrl={redirect}
      />
    </div>
  );
}
