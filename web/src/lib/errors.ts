import { ConvexError } from "convex/values";

/** Mirror of `AuthErrorCode` in convex/lib/auth.ts. */
export type AuthErrorCode =
  | "unauthenticated"
  | "no_active_org"
  | "not_member"
  | "forbidden"
  | "not_found";

export interface AuthErrorData {
  code: AuthErrorCode;
  message: string;
}

/**
 * Extract the typed payload from a thrown Convex error. Returns `null` if the
 * error did not originate from one of our typed `authError(...)` throws.
 *
 * Use this in route boundaries / suspense fallbacks to render `<AccessDenied>`
 * vs. the empty-org screen vs. redirect to sign-in.
 */
export function parseAuthError(err: unknown): AuthErrorData | null {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (
      data &&
      typeof data === "object" &&
      "code" in data &&
      typeof (data as { code: unknown }).code === "string"
    ) {
      const code = (data as { code: string }).code as AuthErrorCode;
      const message =
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : "Access denied.";
      return { code, message };
    }
  }
  return null;
}
