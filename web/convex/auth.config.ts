/**
 * Convex auth configuration.
 *
 * Convex validates the Clerk-issued JWT on every authenticated request using
 * the issuer domain below. Set CLERK_JWT_ISSUER_DOMAIN in the Convex deployment
 * environment (Convex dashboard → Settings → Environment Variables, or
 * `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your>.clerk.accounts.dev`).
 *
 * The Clerk JWT template must be named "convex". See /docs/security-model.md.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
