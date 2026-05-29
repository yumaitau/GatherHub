import SwiftUI

/// Top-level view that switches between sign-in and the main app based on the
/// Clerk session, and (once signed in) syncs the Convex context.
struct RootView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var convex: ConvexService

    /// Result of `sync:currentContext`, loaded after sign-in. `nil` while
    /// loading or when there is no active org / not yet synced.
    @State private var context: CurrentContext?
    @State private var isSyncing = false
    @State private var loadError: String?

    var body: some View {
        Group {
            if !Secrets.isConfigured {
                notConfigured
            } else {
                switch auth.state {
                case .loading:
                    ProgressView("Loading…")
                case .signedOut:
                    SignInView()
                case .signedIn:
                    signedInContent
                }
            }
        }
        .animation(.default, value: auth.state)
    }

    // MARK: - Signed-in routing

    @ViewBuilder
    private var signedInContent: some View {
        if isSyncing && context == nil {
            ProgressView("Syncing your club…")
                .task { await sync() }
        } else if let context {
            // If the user belongs to multiple orgs and none is active yet, let
            // them choose; otherwise drop straight into the app.
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

    // MARK: - Sync

    /// On sign-in, upsert via `sync:ensureFromClient` then load
    /// `sync:currentContext`. Mirrors the web app's load behaviour.
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

    // MARK: - Not configured

    private var notConfigured: some View {
        EmptyStateView(
            title: "Set up required",
            systemImage: "gearshape",
            message: "Add your Clerk publishable key and Convex URL in Config/Secrets.swift (or an .xcconfig), then run again."
        )
    }
}
