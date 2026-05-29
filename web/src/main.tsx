import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import App from "./App";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (!convexUrl || !clerkPublishableKey) {
  // Fail loudly but gracefully if the environment isn't configured yet.
  root.render(
    <MissingConfig convexUrl={convexUrl} clerkKey={clerkPublishableKey} />,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </React.StrictMode>,
  );
}

function MissingConfig({
  convexUrl,
  clerkKey,
}: {
  convexUrl?: string;
  clerkKey?: string;
}) {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "10vh auto",
        padding: "2rem",
        lineHeight: 1.6,
      }}
    >
      <h1>GatherHub — configuration needed</h1>
      <p>
        Copy <code>web/.env.example</code> to <code>web/.env.local</code> and
        set the following before running the app:
      </p>
      <ul>
        <li>
          <code>VITE_CONVEX_URL</code> {convexUrl ? "✓" : "✗ missing"}
        </li>
        <li>
          <code>VITE_CLERK_PUBLISHABLE_KEY</code> {clerkKey ? "✓" : "✗ missing"}
        </li>
      </ul>
      <p>
        See <code>README.md</code> and <code>docs/architecture.md</code> for
        setup instructions.
      </p>
    </div>
  );
}
