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
    @EnvironmentObject private var syncEnv: SyncEnvironment

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
                syncEnv.unbind()
            }
        }
        .onChange(of: syncEnv.monitor.isOnline) { _, isOnline in
            if isOnline, clerk.user != nil {
                Task { await sync() }
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
            MainTabView(context: context, onSwitchOrg: {
                // After Convex flips activeOrgId via organizations:setActive
                // we need to re-pull currentContext so the rest of the
                // app sees the new org name / role / soccerMode.
                Task { await sync() }
            })
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
        guard let clerkUserId = clerk.user?.id else {
            context = nil
            loadError = nil
            syncEnv.unbind()
            return
        }

        isSyncing = true
        if let cached = syncEnv.cachedContext(clerkUserId: clerkUserId) {
            context = cached
            syncEnv.bind(
                clerkUserId: clerkUserId,
                orgId: cached.org.id,
                convex: convex
            )
            try? syncEnv.store?.replaceLocationDefaults(
                LocationDefaults(defaultAddress: cached.org.defaultAddress)
            )
            loadError = nil
        } else {
            loadError = nil
        }
        defer { isSyncing = false }

        guard syncEnv.monitor.isOnline else {
            if context == nil {
                loadError = "You're offline. Sign in online once so GatherHub can cache your club on this device."
            }
            return
        }

        do {
            await convex.refreshAuth()
            try await convex.ensureFromClient()
            let ctx = try await convex.currentContext()
            context = ctx
            // Bind the local SwiftData scope to the active user+org so
            // every cached read/write lands in the right partition.
            // Without this the offline cache stays unscoped and queue
            // ops dropped at sign-in.
            if let ctx {
                syncEnv.rememberContext(ctx, clerkUserId: clerkUserId)
                syncEnv.bind(
                    clerkUserId: clerkUserId,
                    orgId: ctx.org.id,
                    convex: convex
                )
                try? syncEnv.store?.replaceLocationDefaults(
                    LocationDefaults(defaultAddress: ctx.org.defaultAddress)
                )
                await syncEnv.coordinator?.syncIfOnline()
            } else if ctx == nil {
                syncEnv.unbind()
            }
        } catch {
            if context == nil {
                loadError = UserFacingError.message(error, fallback: "Couldn't load your club. Try again.")
            }
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
