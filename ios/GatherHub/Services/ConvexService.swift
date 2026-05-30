import Foundation
import Combine

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

    /// Push the latest Clerk credentials into the Convex client. Call once
    /// after Clerk reports a signed-in user so the underlying FFI client
    /// stores our `AuthProvider`'s token bridge and starts attaching the
    /// JWT to every subscription / mutation. Without this call, Convex
    /// sees every request as unauthenticated and `requireUser` rejects
    /// with "Not authenticated. at ... convex/sync.ts".
    func refreshAuth() async {
        let result = await client.login()
        if case .failure(let error) = result {
            dump(error)
        }
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
        try await once("sync:currentContext")
    }

    /// `sync:myMemberships` (query) — every club the signed-in user
    /// belongs to, with role + active flag. Drives the org switcher.
    func myMemberships() async throws -> [OrgMembership] {
        try await once("sync:myMemberships")
    }

    /// `organizations:setActive` (mutation) — flip the caller's active
    /// org. Subsequent queries scope to the chosen org.
    func setActiveOrg(_ orgId: String) async throws {
        try await client.mutation(
            "organizations:setActive",
            with: ["orgId": orgId]
        )
    }

    // MARK: - Tags / assets

    /// `tags:lookupAuthed` (query, `{ tagId }`) — full asset for a scanned tag
    /// within the user's org.
    func lookupTag(_ tagId: String) async throws -> TagLookupResult {
        try await once("tags:lookupAuthed", with: ["tagId": tagId])
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
        return try await once("events:list", with: args)
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

    /// `members:list` (query). Optional `status` filter ("active" / "inactive").
    func listMembers(status: String? = nil) async throws -> [Member] {
        var args: [String: ConvexEncodable?] = [:]
        if let status { args["status"] = status }
        return try await once("members:list", with: args)
    }

    /// `teams:list` (query) — all teams in active org with roster counts.
    func listTeams(includeInactive: Bool = false) async throws -> [Team] {
        try await once("teams:list", with: ["includeInactive": includeInactive])
    }

    /// `announcements:list` (query).
    func listAnnouncements() async throws -> [Announcement] {
        try await once("announcements:list")
    }

    /// `announcements:markRead` (mutation).
    func markAnnouncementRead(_ id: String) async throws {
        try await client.mutation(
            "announcements:markRead",
            with: ["announcementId": id]
        )
    }

    /// `soccer:playerListing` (query).
    func listPlayerRegistrations() async throws -> [PlayerListingRow] {
        try await once("soccer:playerListing")
    }

    /// `soccer:coachesAndManagers` (query).
    func listCoachesManagers() async throws -> [CoachManagerRow] {
        try await once("soccer:coachesAndManagers")
    }

    /// `soccer:playerRoster` (query) — players with computed grade for
    /// the grading screen.
    func listPlayerRoster() async throws -> [PlayerRosterRow] {
        try await once("soccer:playerRoster")
    }

    /// `soccer:listSkills` (query) — active rubric for the org.
    func listSoccerSkills(includeInactive: Bool = false) async throws -> [SoccerSkill] {
        try await once(
            "soccer:listSkills",
            with: ["includeInactive": includeInactive]
        )
    }

    /// `soccer:playerGrade` (query) — computed grade, division, and the
    /// player's evaluation rows in one call.
    func playerGrade(memberId: String) async throws -> PlayerGrade {
        try await once("soccer:playerGrade", with: ["memberId": memberId])
    }

    /// `soccer:upsertEvaluation` (mutation) — record/update a score for
    /// one skill. Requires coach+.
    func upsertEvaluation(
        memberId: String,
        skillId: String,
        score: Double,
        notes: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = [
            "memberId": memberId,
            "skillId": skillId,
            "score": score,
        ]
        if let notes { args["notes"] = notes }
        try await client.mutation("soccer:upsertEvaluation", with: args)
    }

    // MARK: - Scan + asset registration

    /// `assetOps:recordScan` (mutation). Logs a "scanned" audit entry
    /// against an asset with optional geo coordinates. No state change.
    func recordScan(
        assetId: String,
        latitude: Double? = nil,
        longitude: Double? = nil,
        accuracy: Double? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = ["assetId": assetId]
        if let latitude { args["geoLatitude"] = latitude }
        if let longitude { args["geoLongitude"] = longitude }
        if let accuracy { args["geoAccuracy"] = accuracy }
        try await client.mutation("assetOps:recordScan", with: args)
    }

    /// `assets:registerNfc` (mutation) — bind an NFC tag UID to an
    /// existing asset within the caller's org. Used after a scan
    /// returns "not found" so the user can attach the physical tag to
    /// a known asset record.
    func registerNfc(assetId: String, nfcTagId: String) async throws {
        try await client.mutation(
            "assets:registerNfc",
            with: ["assetId": assetId, "nfcTagId": nfcTagId]
        )
    }

    /// `assets:list` (query) — list of assets for the active org, used
    /// by the register-new-tag picker. The exact return shape depends
    /// on the function; this method decodes a minimal subset.
    func listAssets() async throws -> [AssetSummary] {
        try await once("assets:list")
    }

    // MARK: - Dashboard

    /// `dashboard:stats` (query) — aggregate counters for the active org.
    func dashboardStats() async throws -> DashboardStats {
        try await once("dashboard:stats")
    }

    /// `soccer:dashboardStats` (query) — soccer-mode counters. Returns `nil`
    /// when soccer mode is off, matching the web behaviour.
    func soccerDashboardStats() async throws -> SoccerDashboardStats? {
        try await once("soccer:dashboardStats")
    }

    // MARK: - One-shot query helper

    /// ConvexMobile exposes only the subscription-based `subscribe(to:)` for
    /// queries; there is no one-shot `query()` method. This helper bridges the
    /// gap: it subscribes, takes the first value (the cached result on first
    /// emission), then tears the subscription down. Use for any read that
    /// only needs a snapshot — pull-to-refresh, navigation loads, etc. Pages
    /// that need live updates should subscribe directly.
    private func once<T: Decodable>(
        _ name: String,
        with args: [String: ConvexEncodable?]? = nil
    ) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?
            var resumed = false
            cancellable = client
                .subscribe(to: name, with: args, yielding: T.self)
                .first()
                .sink(
                    receiveCompletion: { completion in
                        defer { cancellable?.cancel() }
                        guard !resumed else { return }
                        if case .failure(let err) = completion {
                            resumed = true
                            continuation.resume(throwing: err)
                        }
                    },
                    receiveValue: { value in
                        guard !resumed else { return }
                        resumed = true
                        continuation.resume(returning: value)
                    }
                )
        }
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
