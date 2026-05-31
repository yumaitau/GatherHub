import SwiftUI
import Clerk
import YumaSupportKit

/// GatherHub — field-operations companion app for community sports clubs.
///
/// Backend: Convex (functions in `web/convex/*`). Auth: Clerk, where each Clerk
/// organisation maps to one club. This app focuses on field ops (scan kit,
/// check in/out, event RSVPs) — not full club administration.
@main
struct GatherHubApp: App {

    /// Tracked Clerk instance. Matches the Clerk SDK Quickstart pattern
    /// (Examples/Quickstart) — holding Clerk.shared as @State at App
    /// scope is what registers the @Observable with SwiftUI's tracking
    /// loop so child views see sign-in transitions.
    @State private var clerk = Clerk.shared

    /// Clerk session state, shared app-wide.
    @StateObject private var auth: AuthService

    /// Convex API wrapper, shared app-wide. Wired to Clerk's JWT provider.
    @StateObject private var convex: ConvexService

    /// SwiftData cache + offline write queue. Single instance, scope
    /// (clerkUserId#orgId) is bound after sign-in by RootView and
    /// purged on sign-out.
    @StateObject private var sync = SyncEnvironment()

    init() {
        // YumaSupportKit configures synchronously so the in-app "Contact
        // support" route is wired before anyone navigates to Profile.
        YumaSupport.configure(
            YumaSupportConfiguration(
                snagSpotToken: Secrets.snagSpotToken,
                customMetadata: [
                    "app": .string("gatherhub-ios"),
                ],
                diagnosticsEnabledByDefault: true,
                fallbackEmail: Secrets.supportEmail
            )
        )

        let authService = AuthService()
        _auth = StateObject(wrappedValue: authService)
        _convex = StateObject(
            wrappedValue: ConvexService(
                authProvider: authService.makeConvexAuthProvider()
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(convex)
                .environmentObject(sync)
                .onOpenURL { url in
                    if let tagId = TagParser.extractTagId(from: url.absoluteString) {
                        DeepLinkRouter.shared.pendingTagId = tagId
                    }
                }
                // Quickstart pattern: configure + load inside the same
                // .task that the @State-tracked clerk lives under. This
                // guarantees the load() call's mutations propagate to
                // the same observation cycle as views reading clerk.user.
                .task {
                    if Secrets.isConfigured {
                        clerk.configure(publishableKey: Secrets.clerkPublishableKey)
                    }
                    do {
                        try await clerk.load()
                    } catch {
                        #if DEBUG
                        debugPrint(UserFacingError.message(error))
                        #endif
                    }
                }
        }
    }
}

/// Minimal app-wide router so a deep-linked tag id can be picked up by the
/// scan/asset flow once the UI is ready.
final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()
    @Published var pendingTagId: String?
    private init() {}
}
