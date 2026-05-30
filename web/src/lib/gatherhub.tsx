/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { type Role, hasAtLeastRole } from "./roles";

export interface GatherHubContextValue {
  isLoading: boolean;
  isSignedInToOrg: boolean;
  role: Role | null;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    imageUrl?: string;
  } | null;
  org: {
    id: string;
    name: string;
    slug?: string;
    soccerMode: boolean;
  } | null;
  /** UI-only gate: does the caller hold at least `min`? (server re-checks). */
  can: (min: Role) => boolean;
}

const Ctx = React.createContext<GatherHubContextValue | null>(null);

/**
 * Provides the current GatherHub context (synced user/org/role). On mount it
 * calls `sync.ensureFromClient` so the Convex mirror exists even without
 * webhooks configured, then reads `sync.currentContext`.
 */
export function GatherHubProvider({ children }: { children: React.ReactNode }) {
  const ensure = useMutation(api.sync.ensureFromClient);
  const context = useQuery(api.sync.currentContext);

  React.useEffect(() => {
    // Fire-and-forget; safe to re-run, it's idempotent.
    ensure().catch(() => {
      /* not signed in / no active org yet */
    });
  }, [ensure]);

  const value = React.useMemo<GatherHubContextValue>(() => {
    const role = (context?.role ?? null) as Role | null;
    return {
      isLoading: context === undefined,
      isSignedInToOrg: !!context,
      role,
      user: context?.user
        ? {
            id: context.user.id,
            firstName: context.user.firstName ?? undefined,
            lastName: context.user.lastName ?? undefined,
            email: context.user.email ?? undefined,
            imageUrl: context.user.imageUrl ?? undefined,
          }
        : null,
      org: context?.org
        ? {
            id: context.org.id,
            name: context.org.name,
            slug: context.org.slug ?? undefined,
            soccerMode: Boolean(context.org.soccerMode),
          }
        : null,
      can: (min: Role) => (role ? hasAtLeastRole(role, min) : false),
    };
  }, [context]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGatherHub(): GatherHubContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx)
    throw new Error("useGatherHub must be used within GatherHubProvider");
  return ctx;
}
