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
        try await performMutation(
            "organizations:updateLocationSettings",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    /// `taxonomies:list` (query) — active KitTrace asset categories for the
    /// current org. Used by the mobile create-asset-from-NFC flow.
    func listAssetCategories() async throws -> [TaxonomyOption] {
        try await once("taxonomies:list", with: ["kind": "asset_category"])
    }

    func listAssetConditions() async throws -> [TaxonomyOption] {
        try await once("taxonomies:list", with: ["kind": "asset_condition"])
    }

    func listEventTypes() async throws -> [TaxonomyOption] {
        try await once("taxonomies:list", with: ["kind": "event_type"])
    }

    /// `taxonomies:list` (query) — soccer team age-group options.
    func listTeamAgeGroups(includeInactive: Bool = false) async throws -> [TaxonomyOption] {
        try await once(
            "taxonomies:list",
            with: ["kind": "team_age_group", "includeInactive": includeInactive]
        )
    }

    @discardableResult
    func createTeamAgeGroup(
        label: String,
        clientMutationId: String? = nil
    ) async throws -> String {
        try await performMutation(
            "taxonomies:create",
            with: ["kind": "team_age_group", "label": label],
            clientMutationId: clientMutationId
        )
    }

    func updateTeamAgeGroup(
        id: String,
        label: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "taxonomies:update",
            with: ["id": id, "label": label],
            clientMutationId: clientMutationId
        )
    }

    func setTeamAgeGroupActive(
        id: String,
        active: Bool,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "taxonomies:setActive",
            with: ["id": id, "active": active],
            clientMutationId: clientMutationId
        )
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
        try await performMutation(
            "assetOps:checkOut",
            with: args,
            clientMutationId: clientMutationId
        )
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
        try await performMutation(
            "assetOps:checkIn",
            with: args,
            clientMutationId: clientMutationId
        )
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
        let args: [String: ConvexEncodable?] = [
            "eventId": eventId,
            "memberId": memberId,
            "status": status.rawValue,
        ]
        try await performMutation(
            "events:setRsvp",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    @discardableResult
    func createEvent(
        _ payload: EventMutationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args = eventArgs(from: payload)
        args["type"] = payload.type
        args["title"] = payload.title
        args["startTime"] = payload.startTime
        return try await performMutation(
            "events:create",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func updateEvent(
        eventId: String,
        payload: EventMutationPayload,
        clientMutationId: String? = nil
    ) async throws {
        var args = eventArgs(from: payload, includeNulls: true)
        args["eventId"] = eventId
        args["type"] = payload.type
        args["title"] = payload.title
        args["startTime"] = payload.startTime
        try await performMutation(
            "events:update",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func removeEvent(
        eventId: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "events:remove",
            with: ["eventId": eventId],
            clientMutationId: clientMutationId
        )
    }

    // MARK: - Members

    /// `members:list` (query). Optional `status` filter ("active" / "inactive").
    func listMembers(status: String? = nil) async throws -> [Member] {
        var args: [String: ConvexEncodable?] = [:]
        if let status { args["status"] = status }
        return try await once("members:list", with: args)
    }

    @discardableResult
    func createMember(
        _ payload: MemberMutationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args: [String: ConvexEncodable?] = [
            "firstName": payload.firstName,
            "lastName": payload.lastName,
            "status": payload.status.rawValue,
            "isVolunteer": payload.isVolunteer,
        ]
        putOptionalString("email", payload.email, into: &args)
        putOptionalString("phone", payload.phone, into: &args)
        putOptionalString("dateOfBirth", payload.dateOfBirth, into: &args)
        putOptionalString("notes", payload.notes, into: &args)
        putOptionalString("clubRole", payload.clubRole, into: &args)
        return try await performMutation(
            "members:create",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func updateMember(
        memberId: String,
        payload: MemberMutationPayload,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = [
            "memberId": memberId,
            "firstName": payload.firstName,
            "lastName": payload.lastName,
            "status": payload.status.rawValue,
            "isVolunteer": payload.isVolunteer,
        ]
        putOptionalString("email", payload.email, into: &args, includeNull: true)
        putOptionalString("phone", payload.phone, into: &args, includeNull: true)
        putOptionalString("dateOfBirth", payload.dateOfBirth, into: &args, includeNull: true)
        putOptionalString("notes", payload.notes, into: &args, includeNull: true)
        putOptionalString("clubRole", payload.clubRole, into: &args, includeNull: true)
        try await performMutation(
            "members:update",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func removeMember(
        memberId: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "members:remove",
            with: ["memberId": memberId],
            clientMutationId: clientMutationId
        )
    }

    /// `teams:list` (query) — all teams in active org with roster counts.
    func listTeams(includeInactive: Bool = false) async throws -> [Team] {
        try await once("teams:list", with: ["includeInactive": includeInactive])
    }

    @discardableResult
    func createTeam(
        _ payload: TeamMutationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args = teamArgs(from: payload)
        args["name"] = payload.name
        return try await performMutation(
            "teams:create",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func updateTeam(
        teamId: String,
        payload: TeamMutationPayload,
        clientMutationId: String? = nil
    ) async throws {
        var args = teamArgs(from: payload, includeNulls: true)
        args["teamId"] = teamId
        args["name"] = payload.name
        args["isActive"] = payload.isActive
        try await performMutation(
            "teams:update",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func removeTeam(
        teamId: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "teams:remove",
            with: ["teamId": teamId],
            clientMutationId: clientMutationId
        )
    }

    /// `announcements:list` (query).
    func listAnnouncements() async throws -> [Announcement] {
        try await once("announcements:list", with: [:])
    }

    /// `announcements:markRead` (mutation).
    func markAnnouncementRead(_ id: String, clientMutationId: String? = nil) async throws {
        let args: [String: ConvexEncodable?] = ["announcementId": id]
        try await performMutation(
            "announcements:markRead",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    @discardableResult
    func createAnnouncement(
        _ payload: AnnouncementMutationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args = announcementArgs(from: payload)
        args["title"] = payload.title
        args["body"] = payload.body
        args["pinned"] = payload.pinned
        return try await performMutation(
            "announcements:create",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func updateAnnouncement(
        announcementId: String,
        payload: AnnouncementMutationPayload,
        clientMutationId: String? = nil
    ) async throws {
        var args = announcementArgs(from: payload, includeNulls: true)
        args["announcementId"] = announcementId
        args["title"] = payload.title
        args["body"] = payload.body
        args["pinned"] = payload.pinned
        try await performMutation(
            "announcements:update",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func removeAnnouncement(
        announcementId: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "announcements:remove",
            with: ["announcementId": announcementId],
            clientMutationId: clientMutationId
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

    /// `soccer:listCompetitions` (query).
    func listSoccerCompetitions() async throws -> [SoccerCompetition] {
        try await once("soccer:listCompetitions")
    }

    @discardableResult
    func upsertSoccerCompetition(
        _ payload: CompetitionMutationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args: [String: ConvexEncodable?] = [
            "name": payload.name,
            "active": payload.active,
        ]
        if let id = payload.id { args["id"] = id }
        putOptionalString("season", payload.season, into: &args, includeNull: payload.id != nil)
        return try await performMutation(
            "soccer:upsertCompetition",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    @discardableResult
    func upsertSoccerDivision(
        _ payload: DivisionMutationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args: [String: ConvexEncodable?] = [
            "name": payload.name,
            "minGrade": payload.minGrade,
            "maxGrade": payload.maxGrade,
            "active": payload.active,
        ]
        if let id = payload.id { args["id"] = id }
        putOptionalString("color", payload.color, into: &args, includeNull: payload.id != nil)
        return try await performMutation(
            "soccer:upsertDivision",
            with: args,
            clientMutationId: clientMutationId
        )
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
        try await performMutation(
            "soccer:upsertRegistration",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func upsertRegistration(
        _ payload: RegistrationMutationPayload,
        clientMutationId: String? = nil
    ) async throws {
        var args = registrationArgs(from: payload.details, includeNulls: true)
        args["memberId"] = payload.memberId
        try await performMutation(
            "soccer:upsertRegistration",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func removeRegistration(
        memberId: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "soccer:removeRegistration",
            with: ["memberId": memberId],
            clientMutationId: clientMutationId
        )
    }

    @discardableResult
    func createFieldRegistration(
        _ payload: FieldRegistrationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args = registrationArgs(from: payload.registration)
        args["firstName"] = payload.firstName
        args["lastName"] = payload.lastName
        if let email = trimmed(payload.email) { args["email"] = email }
        if let phone = trimmed(payload.phone) { args["phone"] = phone }
        if let dateOfBirth = trimmed(payload.dateOfBirth) { args["dateOfBirth"] = dateOfBirth }
        if let notes = trimmed(payload.notes) { args["notes"] = notes }
        if let guardianFirstName = trimmed(payload.guardianFirstName) {
            args["guardianFirstName"] = guardianFirstName
        }
        if let guardianLastName = trimmed(payload.guardianLastName) {
            args["guardianLastName"] = guardianLastName
        }
        if let guardianEmail = trimmed(payload.guardianEmail) { args["guardianEmail"] = guardianEmail }
        if let guardianPhone = trimmed(payload.guardianPhone) { args["guardianPhone"] = guardianPhone }
        if let guardianRelationship = trimmed(payload.guardianRelationship) {
            args["guardianRelationship"] = guardianRelationship
        }
        if let emergencyName = trimmed(payload.emergencyName) { args["emergencyName"] = emergencyName }
        if let emergencyRelationship = trimmed(payload.emergencyRelationship) {
            args["emergencyRelationship"] = emergencyRelationship
        }
        if let emergencyPhone = trimmed(payload.emergencyPhone) { args["emergencyPhone"] = emergencyPhone }
        if let emergencyEmail = trimmed(payload.emergencyEmail) { args["emergencyEmail"] = emergencyEmail }
        return try await performMutation(
            "soccer:createFieldRegistration",
            with: args,
            clientMutationId: clientMutationId
        )
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

    @discardableResult
    func createSoccerSkill(
        _ payload: SkillMutationPayload,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args: [String: ConvexEncodable?] = [
            "name": payload.name,
            "weight": payload.weight,
            "maxScore": payload.maxScore,
        ]
        putOptionalString("description", payload.description, into: &args)
        return try await performMutation(
            "soccer:createSkill",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func updateSoccerSkill(
        skillId: String,
        payload: SkillMutationPayload,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = [
            "id": skillId,
            "name": payload.name,
            "weight": payload.weight,
            "maxScore": payload.maxScore,
            "active": payload.active,
        ]
        putOptionalString("description", payload.description, into: &args, includeNull: true)
        try await performMutation(
            "soccer:updateSkill",
            with: args,
            clientMutationId: clientMutationId
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
        try await performMutation(
            "soccer:upsertEvaluation",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func removeEvaluation(
        memberId: String,
        skillId: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "soccer:removeEvaluation",
            with: ["memberId": memberId, "skillId": skillId],
            clientMutationId: clientMutationId
        )
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
        try await performMutation(
            "assetOps:recordScan",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    /// `assets:registerNfc` (mutation) — bind an NFC tag UID to an
    /// existing asset within the caller's org. Used after a scan
    /// returns "not found" so the user can attach the physical tag to
    /// a known asset record.
    func registerNfc(assetId: String, nfcTagId: String, clientMutationId: String? = nil) async throws {
        let args: [String: ConvexEncodable?] = ["assetId": assetId, "nfcTagId": nfcTagId]
        try await performMutation(
            "assets:registerNfc",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    /// `assets:create` (mutation) — creates a KitTrace asset. The backend
    /// always mints a QR tag; when `nfcTagId` is provided it also binds the
    /// scanned physical NFC UID to the new asset.
    @discardableResult
    func createAsset(
        name: String,
        category: String,
        description: String? = nil,
        serialNumber: String? = nil,
        condition: String? = nil,
        location: String? = nil,
        notes: String? = nil,
        nfcTagId: String? = nil,
        clientMutationId: String? = nil
    ) async throws -> String {
        var args: [String: ConvexEncodable?] = [
            "name": name,
            "category": category,
        ]
        if let description { args["description"] = description }
        if let serialNumber { args["serialNumber"] = serialNumber }
        if let condition { args["condition"] = condition }
        if let location { args["location"] = location }
        if let notes { args["notes"] = notes }
        if let nfcTagId { args["nfcTagId"] = nfcTagId }
        let assetId: String = try await performMutation(
            "assets:create",
            with: args,
            clientMutationId: clientMutationId
        )
        return assetId
    }

    func updateAsset(
        assetId: String,
        payload: AssetMutationPayload,
        clientMutationId: String? = nil
    ) async throws {
        var args = assetArgs(from: payload, includeNulls: true)
        args["assetId"] = assetId
        args["name"] = payload.name
        args["category"] = payload.category
        args["condition"] = payload.condition
        try await performMutation(
            "assets:update",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func retireAsset(
        assetId: String,
        notes: String? = nil,
        clientMutationId: String? = nil
    ) async throws {
        var args: [String: ConvexEncodable?] = ["assetId": assetId]
        putOptionalString("notes", notes, into: &args)
        try await performMutation(
            "assetOps:retire",
            with: args,
            clientMutationId: clientMutationId
        )
    }

    func removeAsset(
        assetId: String,
        clientMutationId: String? = nil
    ) async throws {
        try await performMutation(
            "assets:remove",
            with: ["assetId": assetId],
            clientMutationId: clientMutationId
        )
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

    private func eventArgs(
        from payload: EventMutationPayload,
        includeNulls: Bool = false
    ) -> [String: ConvexEncodable?] {
        var args: [String: ConvexEncodable?] = [:]
        putOptionalString("description", payload.description, into: &args, includeNull: includeNulls)
        putOptionalString("location", payload.location, into: &args, includeNull: includeNulls)
        putOptionalNumber("endTime", payload.endTime, into: &args, includeNull: includeNulls)
        putOptionalString("teamId", payload.teamId, into: &args, includeNull: includeNulls)
        putOptionalString("opponent", payload.opponent, into: &args, includeNull: includeNulls)
        return args
    }

    private func announcementArgs(
        from payload: AnnouncementMutationPayload,
        includeNulls: Bool = false
    ) -> [String: ConvexEncodable?] {
        var args: [String: ConvexEncodable?] = [:]
        putOptionalString("teamId", payload.teamId, into: &args, includeNull: includeNulls)
        return args
    }

    private func assetArgs(
        from payload: AssetMutationPayload,
        includeNulls: Bool = false
    ) -> [String: ConvexEncodable?] {
        var args: [String: ConvexEncodable?] = [:]
        putOptionalString("description", payload.description, into: &args, includeNull: includeNulls)
        putOptionalString("serialNumber", payload.serialNumber, into: &args, includeNull: includeNulls)
        putOptionalString("location", payload.location, into: &args, includeNull: includeNulls)
        putOptionalString("notes", payload.notes, into: &args, includeNull: includeNulls)
        return args
    }

    private func teamArgs(
        from payload: TeamMutationPayload,
        includeNulls: Bool = false
    ) -> [String: ConvexEncodable?] {
        var args: [String: ConvexEncodable?] = [:]
        putOptionalString("ageGroup", payload.ageGroup, into: &args, includeNull: includeNulls)
        putOptionalString("season", payload.season, into: &args, includeNull: includeNulls)
        putOptionalString("description", payload.description, into: &args, includeNull: includeNulls)
        putOptionalString("kitColour", payload.kitColour, into: &args, includeNull: includeNulls)
        putOptionalString("kitBagNumber", payload.kitBagNumber, into: &args, includeNull: includeNulls)
        putOptionalString("competitionId", payload.competitionId, into: &args, includeNull: includeNulls)
        putOptionalString("divisionId", payload.divisionId, into: &args, includeNull: includeNulls)
        putOptionalString("coach", payload.coach, into: &args, includeNull: includeNulls)
        putOptionalString("coachEmail", payload.coachEmail, into: &args, includeNull: includeNulls)
        putOptionalString("coachPhone", payload.coachPhone, into: &args, includeNull: includeNulls)
        putOptionalString("additionalCoach", payload.additionalCoach, into: &args, includeNull: includeNulls)
        putOptionalString("additionalCoachEmail", payload.additionalCoachEmail, into: &args, includeNull: includeNulls)
        putOptionalString("additionalCoachPhone", payload.additionalCoachPhone, into: &args, includeNull: includeNulls)
        putOptionalString("manager", payload.manager, into: &args, includeNull: includeNulls)
        putOptionalString("managerEmail", payload.managerEmail, into: &args, includeNull: includeNulls)
        putOptionalString("managerPhone", payload.managerPhone, into: &args, includeNull: includeNulls)
        if let teamRegistered = payload.teamRegistered { args["teamRegistered"] = teamRegistered }
        putOptionalString("teamRegisteredDate", payload.teamRegisteredDate, into: &args, includeNull: includeNulls)
        if let teamRegistrationPaid = payload.teamRegistrationPaid {
            args["teamRegistrationPaid"] = teamRegistrationPaid
        }
        return args
    }

    private func registrationArgs(
        from payload: RegistrationDetailsPayload,
        includeNulls: Bool = false
    ) -> [String: ConvexEncodable?] {
        var args: [String: ConvexEncodable?] = [
            "registered": payload.registered,
            "paid": payload.paid,
            "paymentPlan": payload.paymentPlan,
            "clearTeam": payload.clearTeam,
            "clearDivision": payload.clearDivision,
        ]
        putOptionalString("competitionId", payload.competitionId, into: &args, includeNull: includeNulls)
        putOptionalString("ageGroupKey", payload.ageGroupKey, into: &args, includeNull: includeNulls)
        putOptionalString("teamId", payload.teamId, into: &args, includeNull: includeNulls)
        putOptionalString("divisionId", payload.divisionId, into: &args, includeNull: includeNulls)
        putOptionalString("ffaNumber", payload.ffaNumber, into: &args, includeNull: includeNulls)
        putOptionalString("gender", payload.gender, into: &args, includeNull: includeNulls)
        putOptionalString("schoolName", payload.schoolName, into: &args, includeNull: includeNulls)
        putOptionalString("paymentPlanStart", payload.paymentPlanStart, into: &args, includeNull: includeNulls)
        putOptionalString("paymentPlanEnd", payload.paymentPlanEnd, into: &args, includeNull: includeNulls)
        putOptionalString("comments", payload.comments, into: &args, includeNull: includeNulls)
        putOptionalString("kitColour", payload.kitColour, into: &args, includeNull: includeNulls)
        return args
    }

    private func putOptionalString(
        _ key: String,
        _ value: String?,
        into args: inout [String: ConvexEncodable?],
        includeNull: Bool = false
    ) {
        if let value = trimmed(value) {
            args[key] = value
        } else if includeNull {
            args.updateValue(nil, forKey: key)
        }
    }

    private func putOptionalNumber(
        _ key: String,
        _ value: Double?,
        into args: inout [String: ConvexEncodable?],
        includeNull: Bool = false
    ) {
        if let value {
            args[key] = value
        } else if includeNull {
            args.updateValue(nil, forKey: key)
        }
    }

    private func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func performMutation(
        _ name: String,
        with args: [String: ConvexEncodable?],
        clientMutationId: String?
    ) async throws {
        var argsWithClientId = args
        if let clientMutationId {
            argsWithClientId["clientMutationId"] = clientMutationId
        }
        do {
            try await client.mutation(name, with: argsWithClientId)
        } catch {
            if shouldRetryWithoutClientMutationId(error, clientMutationId: clientMutationId) {
                try await client.mutation(name, with: args)
            } else {
                throw error
            }
        }
    }

    private func performMutation<T: Decodable>(
        _ name: String,
        with args: [String: ConvexEncodable?],
        clientMutationId: String?
    ) async throws -> T {
        var argsWithClientId = args
        if let clientMutationId {
            argsWithClientId["clientMutationId"] = clientMutationId
        }
        do {
            return try await client.mutation(name, with: argsWithClientId)
        } catch {
            if shouldRetryWithoutClientMutationId(error, clientMutationId: clientMutationId) {
                return try await client.mutation(name, with: args)
            }
            throw error
        }
    }

    private func shouldRetryWithoutClientMutationId(
        _ error: Error,
        clientMutationId: String?
    ) -> Bool {
        guard clientMutationId != nil else { return false }
        let message = error.localizedDescription.lowercased()
        return message.contains("clientmutationid")
            || message.contains("extra field")
            || message.contains("object contains extra")
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
