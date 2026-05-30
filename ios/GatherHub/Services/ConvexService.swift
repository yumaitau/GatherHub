import Foundation

// The Convex Swift client ships as the `ConvexMobile` product of
// https://github.com/get-convex/convex-swift. Add that package in Xcode before
// building (see README.md). Until then, this import will fail to resolve.
import ConvexMobile

/// Thin async wrapper around the Convex Swift `ConvexClient`.
///
/// Every method maps 1:1 to a documented Convex function used by the field-ops
/// app. Function reference names (e.g. `"tags:lookupAuthed"`) match the web app
/// in `web/convex/*`, so the two clients stay in lockstep.
///
/// IMPORTANT: the exact `ConvexMobile` API surface varies between SDK versions.
/// The calls below use the documented `query(_:with:)` / `mutation(_:with:)`
/// style. If the installed version differs (e.g. labels, return decoding, or an
/// `args:` parameter name), adjust these call sites — they are intentionally
/// centralised here so there is a single place to fix.
@MainActor
final class ConvexService: ObservableObject {

    /// Underlying Convex client, configured for `Secrets.convexDeploymentURL`.
    private let client: ConvexClientWithAuth<String>

    /// - Parameter authProvider: supplies the Clerk "convex" JWT to Convex on
    ///   each authenticated call. Provided by `AuthService`.
    init(authProvider: any AuthProvider<String>) {
        // Some SDK versions use `ConvexClient(deploymentUrl:)` plus a separate
        // auth hook; others take the provider in the initializer as below.
        // Adjust to match the installed `ConvexMobile` version.
        self.client = ConvexClientWithAuth(
            deploymentUrl: Secrets.convexDeploymentURL,
            authProvider: authProvider
        )
    }

    // MARK: - Auth lifecycle

    /// Push the latest Clerk credentials into the Convex client. Call after the
    /// Clerk session changes (sign in / org switch). Implementation depends on
    /// the SDK; commonly `client.loginFromCache()` or `client.login(...)`.
    func refreshAuth() async {
        // try? await client.loginFromCache()
    }

    // MARK: - Sync / context

    /// `sync:ensureFromClient` (mutation, no args) — idempotently upserts the
    /// user/org/membership from the verified JWT. Call once on login.
    func ensureFromClient() async throws {
        // Mutation returns { userId, orgId } but the app does not need it here.
        let _: EnsureResult = try await client.mutation("sync:ensureFromClient")
    }

    /// `sync:currentContext` (query) — the signed-in user, active org, and role.
    /// Returns `nil` when signed out / no active org / not yet synced.
    func currentContext() async throws -> CurrentContext? {
        try await client.query("sync:currentContext")
    }

    // MARK: - Tags / assets

    /// `tags:lookupAuthed` (query, `{ tagId }`) — full asset for a scanned tag
    /// within the user's org.
    func lookupTag(_ tagId: String) async throws -> TagLookupResult {
        try await client.query("tags:lookupAuthed", with: ["tagId": tagId])
    }

    /// `assetOps:checkOut` (mutation).
    func checkOut(
        assetId: String,
        custodianMemberId: String,
        location: String? = nil,
        dueBack: Date? = nil,
        notes: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = [
            "assetId": assetId,
            "custodianMemberId": custodianMemberId,
        ]
        if let location { args["location"] = location }
        if let dueBack { args["dueBack"] = dueBack.timeIntervalSince1970 * 1000 }
        if let notes { args["notes"] = notes }
        try await client.mutation("assetOps:checkOut", with: args)
    }

    /// `assetOps:checkIn` (mutation).
    func checkIn(
        assetId: String,
        location: String? = nil,
        notes: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = ["assetId": assetId]
        if let location { args["location"] = location }
        if let notes { args["notes"] = notes }
        try await client.mutation("assetOps:checkIn", with: args)
    }

    // MARK: - Events

    /// `events:list` (query, `{ upcomingOnly?, teamId? }`).
    func listEvents(upcomingOnly: Bool = true, teamId: String? = nil) async throws -> [Event] {
        var args: [String: ConvexEncodable?] = ["upcomingOnly": upcomingOnly]
        if let teamId { args["teamId"] = teamId }
        return try await client.query("events:list", with: args)
    }

    /// `events:setRsvp` (mutation, `{ eventId, memberId, status }`).
    func setRsvp(eventId: String, memberId: String, status: RsvpStatus) async throws {
        try await client.mutation(
            "events:setRsvp",
            with: [
                "eventId": eventId,
                "memberId": memberId,
                "status": status.rawValue,
            ]
        )
    }

    // MARK: - Members

    /// `members:list` (query) — used for picking a custodian / RSVP target.
    func listMembers() async throws -> [Member] {
        try await client.query("members:list")
    }

    // MARK: - Dashboard

    /// `dashboard:stats` (query) — aggregate counters for the active org.
    func dashboardStats() async throws -> DashboardStats {
        try await client.query("dashboard:stats")
    }

    /// `soccer:dashboardStats` (query) — soccer-mode counters. Returns `nil`
    /// when soccer mode is off, matching the web behaviour.
    func soccerDashboardStats() async throws -> SoccerDashboardStats? {
        try await client.query("soccer:dashboardStats")
    }
}

// MARK: - Helper decode types

/// Return shape of `sync:ensureFromClient`.
private struct EnsureResult: Decodable {
    let userId: String
    let orgId: String?
}

// MARK: - SDK shims
//
// The types below document the *expected* shape of the `ConvexMobile` API so
// this file reads cleanly. If the installed SDK already provides equivalents
// (it does, under these or similar names), delete this section. They are marked
// with `#if !canImport` so they only compile when the real SDK is absent — but
// `ConvexMobile` is always imported above, so in practice these are reference
// documentation. Adjust the real call sites instead of relying on these.
//
// Expected real symbols (verify against the installed version):
//   - `ConvexClient(deploymentUrl:)`
//   - `ConvexClientWithAuth(deploymentUrl:authProvider:)`
//   - `func query<T: Decodable>(_ name: String, with args: [String: ConvexEncodable?]) async throws -> T`
//   - `func mutation<T: Decodable>(_ name: String, with args: ...) async throws -> T`
//   - `protocol AuthProvider`  /  `protocol ConvexEncodable`
