import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import App from "./App";
import { MissingConfig } from "./components/MissingConfig";
import { Toaster } from "sonner";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

/** Convex requires an absolute http(s) URL; a bare host crashes its client. */
function isAbsoluteHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const convexUrlValid = isAbsoluteHttpUrl(convexUrl);
const root = ReactDOM.createRoot(document.getElementById("root")!);

if (!convexUrlValid || !clerkPublishableKey) {
  // Fail loudly but gracefully if the environment isn't configured yet.
  root.render(
    <MissingConfig
      convexUrl={convexUrl}
      convexUrlValid={convexUrlValid}
      clerkKey={clerkPublishableKey}
    />,
  );
} else {
  const convex = new ConvexReactClient(convexUrl!);
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <BrowserRouter>
            <App />
            <Toaster
              position="bottom-right"
              theme="system"
              richColors
              closeButton
            />
          </BrowserRouter>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </React.StrictMode>,
  );
}
