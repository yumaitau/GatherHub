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
            #if DEBUG
            debugPrint(UserFacingError.message(error))
            #endif
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

    /// `organizations:locationDefaults` (query) — the active org's default
    /// address, available to all members for location entry defaults.
    func locationDefaults() async throws -> LocationDefaults {
        try await once("organizations:locationDefaults")
    }

    /// `organizations:updateLocationSettings` (mutation) — admin+ only.
    func updateDefaultAddress(_ defaultAddress: String?, clientMutationId: String? = nil) async throws {
        var args: [String: ConvexEncodable?] = [:]
        if let defaultAddress { args["defaultAddress"] = defaultAddress }
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation("organizations:updateLocationSettings", with: args)
    }

    /// `taxonomies:list` (query) — active KitTrace asset categories for the
    /// current org. Used by the mobile create-asset-from-NFC flow.
    func listAssetCategories() async throws -> [TaxonomyOption] {
        try await once("taxonomies:list", with: ["kind": "asset_category"])
    }

    // MARK: - Tags / assets

    /// `tags:lookupAuthed` (query, `{ tagId }`) — full asset for a scanned tag
    /// within the user's org.
    func lookupTag(_ tagId: String) async throws -> TagLookupResult {
        try await once("tags:lookupAuthed", with: ["tagId": tagId])
    }

    /// `assets:history` (query, `{ assetId }`) — immutable lifecycle trail
    /// for one asset. Shown on the scanned asset detail screen.
    func assetHistory(assetId: String) async throws -> [AssetHistoryEntry] {
        try await once("assets:history", with: ["assetId": assetId])
    }

    /// `assetOps:checkOut` (mutation).
    func checkOut(
        assetId: String,
        custodianMemberId: String,
        location: String? = nil,
        dueBack: Date? = nil,
        notes: String? = nil,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = [
            "assetId": assetId,
            "custodianMemberId": custodianMemberId,
        ]
        if let location { args["location"] = location }
        if let dueBack { args["dueBack"] = dueBack.timeIntervalSince1970 * 1000 }
        if let notes { args["notes"] = notes }
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation("assetOps:checkOut", with: args)
    }

    /// `assetOps:checkIn` (mutation).
    func checkIn(
        assetId: String,
        location: String? = nil,
        notes: String? = nil,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = ["assetId": assetId]
        if let location { args["location"] = location }
        if let notes { args["notes"] = notes }
        addClientMutationId(clientMutationId, to: &args)
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
    func setRsvp(
        eventId: String,
        memberId: String,
        status: RsvpStatus,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = [
            "eventId": eventId,
            "memberId": memberId,
            "status": status.rawValue,
        ]
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation(
            "events:setRsvp",
            with: args
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
    func markAnnouncementRead(_ id: String, clientMutationId: String? = nil) async throws {
        var args: [String: ConvexEncodable?] = ["announcementId": id]
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation(
            "announcements:markRead",
            with: args
        )
    }

    /// `soccer:playerListing` (query).
    func listPlayerRegistrations() async throws -> [PlayerListingRow] {
        try await once("soccer:playerListing")
    }

    /// `soccer:listDivisions` (query).
    func listSoccerDivisions() async throws -> [SoccerDivision] {
        try await once("soccer:listDivisions")
    }

    /// `soccer:upsertRegistration` (mutation) — minimal assignment
    /// surface for the iOS quick-edit sheet. `teamId` / `divisionId`
    /// nil + the respective `clear*` flag explicitly removes the
    /// assignment (so auto grade-banding kicks in).
    func updatePlayerAssignment(
        memberId: String,
        teamId: String?,
        divisionId: String?,
        clearTeam: Bool,
        clearDivision: Bool,
        kitColour: String?,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = ["memberId": memberId]
        if let teamId { args["teamId"] = teamId }
        if let divisionId { args["divisionId"] = divisionId }
        if clearTeam { args["clearTeam"] = true }
        if clearDivision { args["clearDivision"] = true }
        if let kitColour { args["kitColour"] = kitColour }
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation("soccer:upsertRegistration", with: args)
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
        notes: String? = nil,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = [
            "memberId": memberId,
            "skillId": skillId,
            "score": score,
        ]
        if let notes { args["notes"] = notes }
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation("soccer:upsertEvaluation", with: args)
    }

    // MARK: - Scan + asset registration

    /// `assetOps:recordScan` (mutation). Logs a "scanned" audit entry
    /// against an asset with optional geo coordinates. No state change.
    func recordScan(
        assetId: String,
        latitude: Double? = nil,
        longitude: Double? = nil,
        accuracy: Double? = nil,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = ["assetId": assetId]
        if let latitude { args["geoLatitude"] = latitude }
        if let longitude { args["geoLongitude"] = longitude }
        if let accuracy { args["geoAccuracy"] = accuracy }
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation("assetOps:recordScan", with: args)
    }

    /// `assets:registerNfc` (mutation) — bind an NFC tag UID to an
    /// existing asset within the caller's org. Used after a scan
    /// returns "not found" so the user can attach the physical tag to
    /// a known asset record.
    func registerNfc(assetId: String, nfcTagId: String, clientMutationId: String? = nil) async throws {
        var args: [String: ConvexEncodable?] = ["assetId": assetId, "nfcTagId": nfcTagId]
        addClientMutationId(clientMutationId, to: &args)
        try await client.mutation(
            "assets:registerNfc",
            with: args
        )
    }

    /// `assets:create` (mutation) — creates a KitTrace asset. The backend
    /// always mints a QR tag; when `nfcTagId` is provided it also binds the
    /// scanned physical NFC UID to the new asset.
    @discardableResult
    func createAsset(
        name: String,
        category: String,
        serialNumber: String? = nil,
        location: String? = nil,
        nfcTagId: String? = nil,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args: [String: ConvexEncodable?] = [
            "name": name,
            "category": category,
        ]
        if let serialNumber { args["serialNumber"] = serialNumber }
        if let location { args["location"] = location }
        if let nfcTagId { args["nfcTagId"] = nfcTagId }
        addClientMutationId(clientMutationId, to: &args)
        let assetId: String = try await client.mutation("assets:create", with: args)
        return assetId
    }

    /// `assets:list` (query) — list of assets for the active org, used
    /// by the register-new-tag picker. The exact return shape depends
    /// on the function; this method decodes a minimal subset.
    func listAssets(status: String? = nil) async throws -> [AssetSummary] {
        var args: [String: ConvexEncodable?] = [:]
        if let status { args["status"] = status }
        return try await once("assets:list", with: args)
    }

    /// Current checked-out/in-use assets for the field home screen.
    func checkedOutAssets() async throws -> [AssetSummary] {
        async let checkedOut = listAssets(status: "checked_out")
        async let inUse = listAssets(status: "in_use")
        let (checkedOutRows, inUseRows) = try await (checkedOut, inUse)
        return (checkedOutRows + inUseRows).sorted { $0.name < $1.name }
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

    private func addClientMutationId(
        _ clientMutationId: String?,
        to args: inout [String: ConvexEncodable?]
    ) {
        if let clientMutationId {
            args["clientMutationId"] = clientMutationId
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
