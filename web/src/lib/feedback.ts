import { toast } from "sonner";
import { parseAuthError } from "@/lib/errors";

const ERROR_PREFIXES = [
  /^Uncaught Error:\s*/i,
  /^ConvexError:\s*/i,
  /^Error:\s*/i,
];

export function userErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Try again.",
) {
  const authError = parseAuthError(error);
  if (authError) return authError.message;

  let message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  message = message.split("\n")[0]?.trim() ?? "";
  for (const prefix of ERROR_PREFIXES) {
    message = message.replace(prefix, "");
  }
  message = message.replace(/\s+at\s+.*$/i, "").trim();

  if (!message) return fallback;
  if (/not authenticated|unauthenticated|signed out/i.test(message)) {
    return "Sign in again, then retry.";
  }
  if (/permission|forbidden|not authorized|unauthori[sz]ed/i.test(message)) {
    return "You do not have permission to do that.";
  }
  if (/not found/i.test(message)) {
    return "That record could not be found. It may have been removed.";
  }
  if (/failed to fetch|network|offline/i.test(message)) {
    return "Connection problem. Check your internet and try again.";
  }

  return message;
}

export function toastFailure(error: unknown, fallback?: string) {
  const message = userErrorMessage(error, fallback);
  toast.error(message);
  return message;
}

export function toastSuccess(message: string) {
  toast.success(message);
}
