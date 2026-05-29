import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

/**
 * Clerk webhook → keeps the Convex mirror of users/orgs/memberships in sync.
 *
 * Configure in the Clerk dashboard: endpoint `<CONVEX_SITE_URL>/clerk-webhook`,
 * subscribe to user.*, organization.*, organizationMembership.* events. Set the
 * signing secret as CLERK_WEBHOOK_SECRET in the Convex environment.
 */
const clerkWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: ClerkEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers) as ClerkEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const d = event.data;
      await ctx.runMutation(internal.clerk.upsertUser, {
        clerkUserId: d.id,
        email: d.email_addresses?.[0]?.email_address,
        firstName: d.first_name ?? undefined,
        lastName: d.last_name ?? undefined,
        imageUrl: d.image_url ?? undefined,
      });
      break;
    }
    case "user.deleted": {
      if (event.data.id) {
        await ctx.runMutation(internal.clerk.deleteUser, {
          clerkUserId: event.data.id,
        });
      }
      break;
    }
    case "organization.created":
    case "organization.updated": {
      const d = event.data;
      await ctx.runMutation(internal.clerk.upsertOrganization, {
        clerkOrgId: d.id,
        name: d.name ?? "Club",
        slug: d.slug ?? undefined,
        imageUrl: d.image_url ?? undefined,
      });
      break;
    }
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const d = event.data;
      await ctx.runMutation(internal.clerk.upsertMembership, {
        clerkOrgId: d.organization.id,
        clerkUserId: d.public_user_data.user_id,
        clerkRole: d.role,
      });
      break;
    }
    case "organizationMembership.deleted": {
      const d = event.data;
      await ctx.runMutation(internal.clerk.removeMembership, {
        clerkOrgId: d.organization.id,
        clerkUserId: d.public_user_data.user_id,
      });
      break;
    }
    default:
      break;
  }

  return new Response(null, { status: 200 });
});

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

export default http;

// --- Minimal typing for the Clerk webhook payloads we consume ----------------
type ClerkEvent =
  | {
      type: "user.created" | "user.updated";
      data: {
        id: string;
        email_addresses?: { email_address: string }[];
        first_name?: string | null;
        last_name?: string | null;
        image_url?: string | null;
      };
    }
  | { type: "user.deleted"; data: { id?: string } }
  | {
      type: "organization.created" | "organization.updated";
      data: {
        id: string;
        name?: string;
        slug?: string | null;
        image_url?: string | null;
      };
    }
  | {
      type: "organizationMembership.created" | "organizationMembership.updated";
      data: {
        role?: string;
        organization: { id: string };
        public_user_data: { user_id: string };
      };
    }
  | {
      type: "organizationMembership.deleted";
      data: {
        organization: { id: string };
        public_user_data: { user_id: string };
      };
    };
