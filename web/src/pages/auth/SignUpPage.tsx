import { SignUp } from "@clerk/clerk-react";

export default function SignUpPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        afterSignInUrl="/"
        afterSignUpUrl="/"
      />
    </div>
  );
}
