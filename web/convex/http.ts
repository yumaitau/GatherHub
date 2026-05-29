import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

/**
 * Clerk webhook → keeps the Convex `users` mirror in sync with Clerk.
 *
 * Configure in the Clerk dashboard: endpoint `<CONVEX_SITE_URL>/clerk-webhook`,
 * subscribe to `user.*` events only. Organisations and memberships are owned
 * by Convex; do NOT enable Clerk Organizations or subscribe to org events.
 * Set the signing secret as CLERK_WEBHOOK_SECRET in the Convex environment.
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
  | { type: "user.deleted"; data: { id?: string } };
