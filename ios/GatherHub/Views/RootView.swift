import SwiftUI
import Clerk

/// Top-level auth gate.
///
/// Mirrors the RangerOS-iOS pattern: the SwiftUI environment holds the
/// shared `Clerk` instance (an `@Observable`), and the view body branches
/// on `clerk.user` directly. Clerk drives the sign-in / sign-out
/// transitions; AuthService and ConvexService run their org-context sync
/// in response. No manual refresh-on-dismiss is needed.
struct RootView: View {
    // Use the SDK's own @Environment entry (\.clerk). It defaults to
    // Clerk.shared and IS the path Clerk's own AuthView reads, so views
    // up and down the tree observe the same @Observable instance.
    @Environment(\.clerk) private var clerk
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var convex: ConvexService

    @State private var context: CurrentContext?
    @State private var isSyncing = false
    @State private var loadError: String?

    var body: some View {
        Group {
            if !Secrets.isConfigured {
                notConfigured
            } else if !clerk.isLoaded {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.gh.paper.ignoresSafeArea())
            } else if clerk.user == nil {
                SignInView()
            } else {
                signedInContent
            }
        }
        // Re-run the org-context sync whenever the Clerk user identity
        // changes (sign-in, sign-out, account switch).
        .task(id: clerk.user?.id) {
            if clerk.user != nil {
                await sync()
            } else {
                context = nil
                loadError = nil
            }
        }
    }

    @ViewBuilder
    private var signedInContent: some View {
        if isSyncing && context == nil {
            ProgressView("Syncing your club…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.gh.paper.ignoresSafeArea())
        } else if let context {
            if auth.activeOrgId == nil && auth.organizations.count > 1 {
                OrgPickerView()
            } else {
                MainTabView(context: context)
            }
        } else if loadError != nil {
            OfflineStateView(
                title: "Couldn't load your club",
                message: loadError ?? "Please try again.",
                retry: { await sync() }
            )
        } else {
            Color.clear.task { await sync() }
        }
    }

    private func sync() async {
        isSyncing = true
        loadError = nil
        defer { isSyncing = false }
        do {
            await convex.refreshAuth()
            try await convex.ensureFromClient()
            context = try await convex.currentContext()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private var notConfigured: some View {
        EmptyStateView(
            title: "Set up required",
            systemImage: "gearshape",
            message: "Add your Clerk publishable key and Convex URL in Config/Secrets.swift (or an .xcconfig), then run again."
        )
    }
}
