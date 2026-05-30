import Foundation
import SwiftUI
import Observation

// Clerk's iOS SDK is the `Clerk` product of https://github.com/clerk/clerk-ios.
// Add it in Xcode before building (see README.md). Until then this import fails
// to resolve, and the Clerk-specific bodies below are written against the
// documented async API and should be adjusted to the installed version.
import Clerk

// The Convex auth provider protocol comes from `ConvexMobile`.
import ConvexMobile

/// Observable Clerk session state for the app.
///
/// Responsibilities:
/// - Track signed-in / signed-out state and the active organisation.
/// - Expose `signIn` / `signOut`.
/// - Vend the Clerk "convex" JWT to Convex via `clerkConvexAuthProvider`.
///
/// MVVM-lite: views observe this directly. Clerk wiring is intentionally thin;
/// most real apps embed Clerk's prebuilt `AuthView`, which manages the flow.
@MainActor
final class AuthService: ObservableObject {

    enum SessionState: Equatable {
        case loading      // determining session on launch
        case signedOut
        case signedIn
    }

    @Published private(set) var state: SessionState = .loading

    /// All organisations the signed-in user belongs to (for OrgPickerView).
    @Published private(set) var organizations: [Org] = []

    /// The currently active organisation id (Clerk's active org), if any.
    @Published var activeOrgId: String?

    /// Surfaced auth error for the UI.
    @Published var lastError: String?

    private let clerk = Clerk.shared

    // MARK: - Lifecycle

    /// Configure and load the Clerk session. Call once at app launch.
    func bootstrap() async {
        guard Secrets.isConfigured else {
            // Leave in signedOut so the UI can show a "configure me" message.
            state = .signedOut
            return
        }
        do {
            // Clerk is configured in `GatherHubApp` via `Clerk.shared.configure`.
            // `load()` restores any cached session.
            try await clerk.load()
            await refreshFromClerk()
            startObservingClerk()
        } catch {
            lastError = error.localizedDescription
            state = .signedOut
        }
    }

    /// Continuously track changes to Clerk's `user` / `session` so this
    /// service mirrors them into the `@Published` SwiftUI state without
    /// callers having to remember to call `refreshFromClerk()` after every
    /// auth event. Uses Observation's tracking loop: each fire re-arms
    /// itself by recursing into a fresh `withObservationTracking` call.
    private func startObservingClerk() {
        let cb: @Sendable () -> Void = { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.refreshFromClerk()
                self.startObservingClerk()
            }
        }
        withObservationTracking { [clerk] in
            _ = clerk.user
            _ = clerk.session
        } onChange: {
            cb()
        }
    }

    /// Recompute published state from the current Clerk session.
    func refreshFromClerk() async {
        if clerk.user != nil {
            state = .signedIn
            // Map Clerk organisation memberships into our `Org` model.
            // API shape varies by version; adjust the property paths as needed.
            // organizations = clerk.user?.organizationMemberships?.map { ... } ?? []
            // activeOrgId = clerk.session?.lastActiveOrganizationId
        } else {
            state = .signedOut
            organizations = []
            activeOrgId = nil
        }
    }

    // MARK: - Actions

    /// Sign in with email + password.
    ///
    /// This is a minimal example flow. In production prefer Clerk's prebuilt
    /// `AuthView`/`SignInView` SwiftUI components, which also cover OAuth, MFA,
    /// and email codes. See README.md.
    func signIn(email: String, password: String) async {
        lastError = nil
        // try await SignIn.create(strategy: .identifier(email, password: password))
        // Placeholder so the scaffold compiles before SDK wiring:
        _ = (email, password)
        await refreshFromClerk()
    }

    func signOut() async {
        do {
            try await clerk.signOut()
        } catch {
            lastError = error.localizedDescription
        }
        await refreshFromClerk()
    }

    /// Switch the active organisation (when the user belongs to several).
    func setActiveOrg(_ orgId: String) async {
        // try await clerk.session?.setActiveOrganization(orgId)
        activeOrgId = orgId
        await refreshFromClerk()
    }

    /// Auth provider handed to `ConvexService` so Convex can fetch the Clerk
    /// JWT minted from the "convex" template (`Secrets.convexJWTTemplate`).
    func makeConvexAuthProvider() -> any AuthProvider<String> {
        ClerkConvexAuthProvider(clerk: clerk, template: Secrets.convexJWTTemplate)
    }
}

/// Bridges Clerk's JWT into Convex's `AuthProvider`.
///
/// Matches the ConvexMobile v0.4+ shape:
///   login(onIdToken:) async throws -> T
///   loginFromCache(onIdToken:) async throws -> T
///   logout() async throws
///   extractIdToken(from:) -> String
///
/// `T` is `String` here — the credential is the JWT itself. Real Clerk token
/// retrieval is left as a `// TODO` so this file compiles cleanly against
/// the package; wire `clerk.session?.getToken(.init(template: template))` once
/// the auth flow is exercised end-to-end.
struct ClerkConvexAuthProvider: AuthProvider {
    typealias T = String

    let clerk: Clerk
    let template: String

    func extractIdToken(from authResult: String) -> String { authResult }

    func login(
        onIdToken: @Sendable @escaping (String?) -> Void
    ) async throws -> String {
        let token = try await currentToken()
        onIdToken(token)
        return token
    }

    func loginFromCache(
        onIdToken: @Sendable @escaping (String?) -> Void
    ) async throws -> String {
        let token = try await currentToken()
        onIdToken(token)
        return token
    }

    func logout() async throws {
        // Sign-out is owned by `AuthService.signOut()`. Nothing additional
        // to do here for token state — the Clerk session is already gone.
    }

    /// Fetch a fresh "convex" JWT from Clerk. Returns "" when no signed-in
    /// session exists so Convex falls back to unauthenticated calls (e.g.
    /// `tags:lookupPublic`).
    private func currentToken() async throws -> String {
        // TODO: replace with the real Clerk session-token API once verified
        // against the installed SDK version, e.g.:
        //   let resource = try await clerk.session?.getToken(
        //     .init(template: template)
        //   )
        //   return resource?.jwt ?? ""
        return ""
    }
}
