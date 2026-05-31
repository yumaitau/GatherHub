import Foundation

enum UserFacingError {
    static func message(
        _ error: Error,
        fallback: String = "Something went wrong. Try again."
    ) -> String {
        message(error.localizedDescription, fallback: fallback) ?? fallback
    }

    static func message(
        _ text: String?,
        fallback: String = "Something went wrong. Try again."
    ) -> String? {
        guard var message = text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !message.isEmpty
        else {
            return nil
        }

        message = message.components(separatedBy: .newlines).first ?? message
        for prefix in ["Uncaught Error:", "ConvexError:", "Error:"] {
            if message.range(of: prefix, options: [.caseInsensitive, .anchored]) != nil {
                message = String(message.dropFirst(prefix.count))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        let lower = message.lowercased()
        if lower.contains("not authenticated") ||
            lower.contains("unauthenticated") ||
            lower.contains("signed out") {
            return "Sign in again, then retry."
        }
        if lower.contains("permission") ||
            lower.contains("forbidden") ||
            lower.contains("not authorized") ||
            lower.contains("not authorised") {
            return "You do not have permission to do that."
        }
        if lower.contains("not found") {
            return "That record could not be found. It may have been removed."
        }
        if lower.contains("network") ||
            lower.contains("offline") ||
            lower.contains("timed out") ||
            lower.contains("internet") {
            return "Connection problem. Check your internet and try again."
        }
        if lower.contains("operation couldn") ||
            lower.hasPrefix("the operation couldn") ||
            lower.contains("error domain=") {
            return fallback
        }

        return message.isEmpty ? fallback : message
    }
}
