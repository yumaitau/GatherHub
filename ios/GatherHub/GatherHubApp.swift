import SwiftUI
import Clerk

/// GatherHub — field-operations companion app for community sports clubs.
///
/// Backend: Convex (functions in `web/convex/*`). Auth: Clerk, where each Clerk
/// organisation maps to one club. This app focuses on field ops (scan kit,
/// check in/out, event RSVPs) — not full club administration.
@main
struct GatherHubApp: App {

    /// Clerk session state, shared app-wide.
    @StateObject private var auth: AuthService

    /// Convex API wrapper, shared app-wide. Wired to Clerk's JWT provider.
    @StateObject private var convex: ConvexService

    init() {
        // Configure Clerk with the publishable key before anything else.
        // (No-op friendly when the key is still a placeholder.)
        if Secrets.isConfigured {
            Clerk.shared.configure(publishableKey: Secrets.clerkPublishableKey)
        }

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
                // Handle gatherhub://asset/tag_xxx deep links.
                .onOpenURL { url in
                    if let tagId = TagParser.extractTagId(from: url.absoluteString) {
                        DeepLinkRouter.shared.pendingTagId = tagId
                    }
                }
                .task { await auth.bootstrap() }
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
