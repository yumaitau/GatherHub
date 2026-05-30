import Foundation

/// App configuration / secrets.
///
/// These are NOT real secrets — fill them in before running. The Clerk
/// publishable key is safe to ship in a client (it is, by design, public), and
/// the Convex deployment URL is likewise public. Anything truly secret lives in
/// the Convex deployment environment, never here.
///
/// Recommended: instead of editing this file, inject the values via an
/// `.xcconfig` file (e.g. `Config.xcconfig`) and read them from the Info.plist
/// at runtime. A simple placeholder is used here to keep the scaffold building.
enum Secrets {

    /// Clerk publishable key, e.g. `pk_test_xxx` or `pk_live_xxx`.
    /// Find it in the Clerk dashboard → API Keys.
    static let clerkPublishableKey = "pk_test_REPLACE_ME"

    /// Convex deployment URL, e.g. `https://your-deployment-123.convex.cloud`.
    /// Find it in the Convex dashboard, or `npx convex dashboard`.
    static let convexDeploymentURL = "https://REPLACE_ME.convex.cloud"

    /// The name of the Clerk JWT template that Convex validates against.
    /// Must match `applicationID` in `web/convex/auth.config.ts` ("convex").
    static let convexJWTTemplate = "convex"

    /// SnagSpot team token used by YumaSupportKit to deliver in-app support
    /// tickets. Generated in the SnagSpot dashboard. When left blank, the
    /// support form falls back to opening a mailto: link to `supportEmail`.
    static let snagSpotToken = ""

    /// Fallback email address shown to users when SnagSpot is unreachable
    /// or unconfigured.
    static let supportEmail = "support@yumait.com.au"

    /// True when the placeholders above have not been replaced. Used by the UI
    /// to show a friendly "configure me" message instead of failing silently.
    static var isConfigured: Bool {
        !clerkPublishableKey.contains("REPLACE_ME")
            && !convexDeploymentURL.contains("REPLACE_ME")
    }
}
