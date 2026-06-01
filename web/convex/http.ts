import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

const uploadOwnerTypes = [
  "certifications",
  "news",
  "qrSettings",
  "sponsors",
] as const;
const uploadPurposes = ["coverImage", "document", "logo", "qrLogo"] as const;

type UploadOwnerType = (typeof uploadOwnerTypes)[number];
type UploadPurpose = (typeof uploadPurposes)[number];
type UploadUrlBody = {
  ownerType: UploadOwnerType;
  ownerId: string;
  purpose: UploadPurpose;
  fileName?: string;
  contentType: string;
  size: number;
};

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
      const pending = pendingMembershipFromMetadata(d.public_metadata);
      await ctx.runMutation(internal.clerk.upsertUser, {
        clerkUserId: d.id,
        email: d.email_addresses?.[0]?.email_address,
        firstName: d.first_name ?? undefined,
        lastName: d.last_name ?? undefined,
        imageUrl: d.image_url ?? undefined,
        pendingOrgId: pending?.pendingOrgId,
        pendingRole: pending?.pendingRole,
        pendingRoleKey: pending?.pendingRoleKey,
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

const uploadUrl = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return jsonResponse({ error: "Sign in to continue." }, 401);
  }

  let body: UploadUrlBody;
  try {
    body = parseUploadUrlBody(await request.json());
  } catch (err) {
    return jsonResponse({ error: errorMessage(err) }, 400);
  }

  try {
    const result = await ctx.runMutation(
      internal.files.generateUploadUrlForHttp,
      {
        clerkUserId: identity.subject,
        ...body,
      },
    );
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse(
      { error: errorMessage(err) },
      statusForUploadError(errorMessage(err)),
    );
  }
});

const options = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
});

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

http.route({
  path: "/files/upload-url",
  method: "POST",
  handler: uploadUrl,
});

http.route({
  path: "/files/upload-url",
  method: "OPTIONS",
  handler: options,
});

export default http;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function parseUploadUrlBody(value: unknown): UploadUrlBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  const ownerType = stringEnum(body.ownerType, uploadOwnerTypes, "ownerType");
  const purpose = stringEnum(body.purpose, uploadPurposes, "purpose");
  const ownerId = requiredString(body.ownerId, "ownerId");
  const contentType = requiredString(body.contentType, "contentType");
  const size = body.size;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    throw new Error("size must be a positive number of bytes.");
  }
  const fileName =
    body.fileName === undefined
      ? undefined
      : requiredString(body.fileName, "fileName");
  return { ownerType, ownerId, purpose, fileName, contentType, size };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value;
}

function stringEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new Error(`${field} is not supported.`);
  }
  return value as T[number];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function statusForUploadError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("missing required r2")) return 500;
  if (
    lower.includes("permission") ||
    lower.includes("not a member") ||
    lower.includes("organisation")
  ) {
    return 403;
  }
  return 400;
}

const ROLES = [
  "owner",
  "admin",
  "committee",
  "coach",
  "volunteer",
  "parent",
  "player",
] as const;

type Role = (typeof ROLES)[number];

function pendingMembershipFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
):
  | {
      pendingOrgId: string;
      pendingRole: Role;
      pendingRoleKey?: string;
    }
  | undefined {
  const pendingOrgId = metadata?.pendingOrgId;
  const pendingRole = metadata?.pendingRole;
  const pendingRoleKey = metadata?.pendingRoleKey;
  if (
    typeof pendingOrgId !== "string" ||
    typeof pendingRole !== "string" ||
    !(ROLES as readonly string[]).includes(pendingRole)
  ) {
    return undefined;
  }
  return {
    pendingOrgId,
    pendingRole: pendingRole as Role,
    pendingRoleKey:
      typeof pendingRoleKey === "string" ? pendingRoleKey : undefined,
  };
}

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
        public_metadata?: Record<string, unknown> | null;
      };
    }
  | { type: "user.deleted"; data: { id?: string } };
