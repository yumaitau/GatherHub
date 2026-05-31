import Foundation

/// App configuration.
///
/// GatherHub is a SaaS run by Yuma IT — every install points at the same
/// production Convex deployment and the same Clerk tenant. Both values
/// below are public-by-design (Clerk publishable keys are intended for
/// client embedding; Convex deployment URLs are HTTPS endpoints with
/// server-side auth). They are safe to commit.
///
/// Anything truly secret (Clerk secret key, webhook signing secret,
/// Resend API key, etc.) lives in the Convex deployment environment,
/// never in this file.
enum Secrets {

    /// Clerk publishable key. Matches the web app's
    /// `VITE_CLERK_PUBLISHABLE_KEY`.
    static let clerkPublishableKey =
        "pk_test_dmlhYmxlLWFkZGVyLTUyLmNsZXJrLmFjY291bnRzLmRldiQ"

    /// Convex deployment URL. Matches the web app's `VITE_CONVEX_URL`.
    static let convexDeploymentURL =
        "https://graceful-jellyfish-285.convex.cloud"

    /// The name of the Clerk JWT template that Convex validates against.
    /// Must match `applicationID` in `web/convex/auth.config.ts` ("convex").
    static let convexJWTTemplate = "convex"

    /// Google Maps Platform key used for iOS Places address lookup. Use a
    /// separate key from the web app, restricted to the iOS bundle identifier.
    static let googleMapsAPIKey = infoValue("GoogleMapsAPIKey")

    /// SnagSpot team token used by YumaSupportKit to deliver in-app support
    /// tickets. Generated in the SnagSpot dashboard. When left blank, the
    /// support form falls back to opening a mailto: link to `supportEmail`.
    static let snagSpotToken = ""

    /// Fallback email address shown to users when SnagSpot is unreachable
    /// or unconfigured.
    static let supportEmail = "support@yumait.com.au"

    /// Always true now that the SaaS endpoints are baked in. Kept so callers
    /// can keep the historical guard pattern without behaviour change.
    static let isConfigured = true

    private static func infoValue(_ key: String) -> String {
        let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.hasPrefix("$(") ? "" : value
    }
}
