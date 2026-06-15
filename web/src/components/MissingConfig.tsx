export function MissingConfig({
  convexUrl,
  convexUrlValid = Boolean(convexUrl),
  clerkKey,
}: {
  convexUrl?: string;
  convexUrlValid?: boolean;
  clerkKey?: string;
}) {
  const convexStatus = convexUrlValid
    ? "✓"
    : convexUrl
      ? "✗ not an absolute URL (must start with https://)"
      : "✗ missing";
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
          <code>VITE_CONVEX_URL</code> {convexStatus}
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
