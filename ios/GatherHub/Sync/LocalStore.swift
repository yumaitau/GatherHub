import Foundation
import SwiftData

/// Scoped read/write access to the local cache + sync queue.
///
/// Every method is constrained to a single `scopeKey` (`clerkUserId#orgId`),
/// the same defence RangerOS uses against cross-org / cross-user
/// leakage on a shared device. The scope flips on sign-in or org-switch;
/// on sign-out the scope is purged.
@MainActor
final class LocalStore {
    private let context: ModelContext
    private(set) var scopeKey: String

    init(context: ModelContext, scopeKey: String) {
        self.context = context
        self.scopeKey = scopeKey
    }

    /// Flip the active scope (e.g. user switched clubs). Cached rows for
    /// the previous scope stay on disk but are unreachable through this
    /// instance until the scope flips back.
    func setScope(_ newScope: String) {
        scopeKey = newScope
    }

    // MARK: - Events

    func replaceEvents(_ events: [Event]) throws {
        let key = scopeKey
        try context.delete(
            model: CachedEvent.self,
            where: #Predicate { $0.scopeKey == key }
        )
        for event in events {
            context.insert(try CachedEvent(event: event, scopeKey: key))
        }
        try context.save()
        try markCollectionCached("events")
    }

    func cachedEvents() throws -> [Event] {
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedEvent>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.startTime, order: .forward)]
        )
        return try context.fetch(descriptor).compactMap { try? $0.decoded() }
    }

    func hasCachedEvents() throws -> Bool {
        if try hasCollectionCache("events") { return true }
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedEvent>(
            predicate: #Predicate { $0.scopeKey == key }
        )
        return try context.fetchCount(descriptor) > 0
    }

    // MARK: - Members

    func replaceMembers(_ members: [Member]) throws {
        let key = scopeKey
        try context.delete(model: CachedMember.self, where: #Predicate { $0.scopeKey == key })
        for m in members {
            context.insert(try CachedMember(member: m, scopeKey: key))
        }
        try context.save()
        try markCollectionCached("members")
    }

    func cachedMembers() throws -> [Member] {
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedMember>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.lastName), SortDescriptor(\.firstName)]
        )
        return try context.fetch(descriptor).compactMap { try? $0.decoded() }
    }

    func hasCachedMembers() throws -> Bool {
        if try hasCollectionCache("members") { return true }
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedMember>(
            predicate: #Predicate { $0.scopeKey == key }
        )
        return try context.fetchCount(descriptor) > 0
    }

    // MARK: - Teams

    func replaceTeams(_ teams: [Team]) throws {
        let key = scopeKey
        try context.delete(model: CachedTeam.self, where: #Predicate { $0.scopeKey == key })
        for t in teams {
            context.insert(try CachedTeam(team: t, scopeKey: key))
        }
        try context.save()
        try markCollectionCached("teams")
    }

    func cachedTeams() throws -> [Team] {
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedTeam>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.name)]
        )
        return try context.fetch(descriptor).compactMap { try? $0.decoded() }
    }

    func hasCachedTeams() throws -> Bool {
        if try hasCollectionCache("teams") { return true }
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedTeam>(
            predicate: #Predicate { $0.scopeKey == key }
        )
        return try context.fetchCount(descriptor) > 0
    }

    // MARK: - Announcements

    func replaceAnnouncements(_ rows: [Announcement]) throws {
        let key = scopeKey
        try context.delete(model: CachedAnnouncement.self, where: #Predicate { $0.scopeKey == key })
        for a in rows {
            context.insert(try CachedAnnouncement(announcement: a, scopeKey: key))
        }
        try context.save()
        try markCollectionCached("announcements")
    }

    func cachedAnnouncements() throws -> [Announcement] {
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedAnnouncement>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.creationTime, order: .reverse)]
        )
        return try context.fetch(descriptor).compactMap { try? $0.decoded() }
    }

    func hasCachedAnnouncements() throws -> Bool {
        if try hasCollectionCache("announcements") { return true }
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedAnnouncement>(
            predicate: #Predicate { $0.scopeKey == key }
        )
        return try context.fetchCount(descriptor) > 0
    }

    // MARK: - Soccer registrations

    func replacePlayerListings(_ rows: [PlayerListingRow]) throws {
        let key = scopeKey
        try context.delete(model: CachedPlayerListing.self, where: #Predicate { $0.scopeKey == key })
        for r in rows {
            context.insert(try CachedPlayerListing(row: r, scopeKey: key))
        }
        try context.save()
        try markCollectionCached("soccer.playerListings")
    }

    func cachedPlayerListings() throws -> [PlayerListingRow] {
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedPlayerListing>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.name)]
        )
        return try context.fetch(descriptor).compactMap { try? $0.decoded() }
    }

    func hasCachedPlayerListings() throws -> Bool {
        if try hasCollectionCache("soccer.playerListings") { return true }
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedPlayerListing>(
            predicate: #Predicate { $0.scopeKey == key }
        )
        return try context.fetchCount(descriptor) > 0
    }

    // MARK: - Generic read-through cache

    func replaceDashboard(_ snapshot: DashboardSnapshot) throws {
        try cacheValue(snapshot, for: "dashboard.snapshot")
    }

    func cachedDashboard() throws -> DashboardSnapshot? {
        try cachedValue(for: "dashboard.snapshot", as: DashboardSnapshot.self)
    }

    func replaceCheckedOutAssets(_ rows: [AssetSummary]) throws {
        try cacheValue(rows, for: "assets.checkedOut")
    }

    func cachedCheckedOutAssets() throws -> [AssetSummary] {
        try cachedValue(for: "assets.checkedOut", as: [AssetSummary].self) ?? []
    }

    func hasCachedCheckedOutAssets() throws -> Bool {
        try hasCachedValue(for: "assets.checkedOut")
    }

    func replaceAssets(_ rows: [AssetSummary], status: String? = nil) throws {
        try cacheValue(rows, for: assetListKey(status: status))
    }

    func cachedAssets(status: String? = nil) throws -> [AssetSummary] {
        try cachedValue(for: assetListKey(status: status), as: [AssetSummary].self) ?? []
    }

    func hasCachedAssets(status: String? = nil) throws -> Bool {
        try hasCachedValue(for: assetListKey(status: status))
    }

    func replaceLocationDefaults(_ defaults: LocationDefaults) throws {
        try cacheValue(defaults, for: "org.locationDefaults")
    }

    func cachedLocationDefaults() throws -> LocationDefaults? {
        try cachedValue(for: "org.locationDefaults", as: LocationDefaults.self)
    }

    func hasCachedLocationDefaults() throws -> Bool {
        try hasCachedValue(for: "org.locationDefaults")
    }

    func replaceAssetCategories(_ rows: [TaxonomyOption]) throws {
        try cacheValue(rows, for: "taxonomies.assetCategories")
    }

    func cachedAssetCategories() throws -> [TaxonomyOption] {
        try cachedValue(for: "taxonomies.assetCategories", as: [TaxonomyOption].self) ?? []
    }

    func hasCachedAssetCategories() throws -> Bool {
        try hasCachedValue(for: "taxonomies.assetCategories")
    }

    func replaceTeamAgeGroups(_ rows: [TaxonomyOption]) throws {
        try cacheValue(rows, for: "taxonomies.teamAgeGroups")
    }

    func cachedTeamAgeGroups() throws -> [TaxonomyOption] {
        try cachedValue(for: "taxonomies.teamAgeGroups", as: [TaxonomyOption].self) ?? []
    }

    func hasCachedTeamAgeGroups() throws -> Bool {
        try hasCachedValue(for: "taxonomies.teamAgeGroups")
    }

    func replaceTagLookup(_ result: TagLookupResult, tagId: String) throws {
        try cacheValue(result, for: "tags.lookup.\(tagId)")
    }

    func cachedTagLookup(tagId: String) throws -> TagLookupResult? {
        try cachedValue(for: "tags.lookup.\(tagId)", as: TagLookupResult.self)
    }

    func replaceAssetHistory(_ rows: [AssetHistoryEntry], assetId: String) throws {
        try cacheValue(rows, for: "assets.history.\(assetId)")
    }

    func cachedAssetHistory(assetId: String) throws -> [AssetHistoryEntry] {
        try cachedValue(for: "assets.history.\(assetId)", as: [AssetHistoryEntry].self) ?? []
    }

    func hasCachedAssetHistory(assetId: String) throws -> Bool {
        try hasCachedValue(for: "assets.history.\(assetId)")
    }

    func replaceSoccerDivisions(_ rows: [SoccerDivision]) throws {
        try cacheValue(rows, for: "soccer.divisions")
    }

    func cachedSoccerDivisions() throws -> [SoccerDivision] {
        try cachedValue(for: "soccer.divisions", as: [SoccerDivision].self) ?? []
    }

    func hasCachedSoccerDivisions() throws -> Bool {
        try hasCachedValue(for: "soccer.divisions")
    }

    func replaceSoccerCompetitions(_ rows: [SoccerCompetition]) throws {
        try cacheValue(rows, for: "soccer.competitions")
    }

    func cachedSoccerCompetitions() throws -> [SoccerCompetition] {
        try cachedValue(for: "soccer.competitions", as: [SoccerCompetition].self) ?? []
    }

    func hasCachedSoccerCompetitions() throws -> Bool {
        try hasCachedValue(for: "soccer.competitions")
    }

    func replaceSoccerSkills(_ rows: [SoccerSkill]) throws {
        try cacheValue(rows, for: "soccer.skills")
    }

    func cachedSoccerSkills() throws -> [SoccerSkill] {
        try cachedValue(for: "soccer.skills", as: [SoccerSkill].self) ?? []
    }

    func hasCachedSoccerSkills() throws -> Bool {
        try hasCachedValue(for: "soccer.skills")
    }

    func replacePlayerGrade(_ grade: PlayerGrade, memberId: String) throws {
        try cacheValue(grade, for: "soccer.playerGrade.\(memberId)")
    }

    func cachedPlayerGrade(memberId: String) throws -> PlayerGrade? {
        try cachedValue(for: "soccer.playerGrade.\(memberId)", as: PlayerGrade.self)
    }

    func replacePlayerRoster(_ rows: [PlayerRosterRow]) throws {
        try cacheValue(rows, for: "soccer.playerRoster")
    }

    func cachedPlayerRoster() throws -> [PlayerRosterRow] {
        try cachedValue(for: "soccer.playerRoster", as: [PlayerRosterRow].self) ?? []
    }

    func hasCachedPlayerRoster() throws -> Bool {
        try hasCachedValue(for: "soccer.playerRoster")
    }

    func replaceCoachesManagers(_ rows: [CoachManagerRow]) throws {
        try cacheValue(rows, for: "soccer.coachesManagers")
    }

    func cachedCoachesManagers() throws -> [CoachManagerRow] {
        try cachedValue(for: "soccer.coachesManagers", as: [CoachManagerRow].self) ?? []
    }

    func hasCachedCoachesManagers() throws -> Bool {
        try hasCachedValue(for: "soccer.coachesManagers")
    }

    func replaceOrgMemberships(_ rows: [OrgMembership]) throws {
        try cacheValue(rows, for: "org.memberships")
    }

    func cachedOrgMemberships() throws -> [OrgMembership] {
        try cachedValue(for: "org.memberships", as: [OrgMembership].self) ?? []
    }

    func hasCachedOrgMemberships() throws -> Bool {
        try hasCachedValue(for: "org.memberships")
    }

    // MARK: - Sync queue

    @discardableResult
    func enqueue(
        kind: SyncOperationKind,
        title: String,
        payload: Data,
        clientId: String = UUID().uuidString
    ) throws -> PendingSyncOperation {
        let op = PendingSyncOperation(
            scopeKey: scopeKey,
            kind: kind,
            clientId: clientId,
            title: title,
            payload: payload
        )
        context.insert(op)
        try context.save()
        return op
    }

    func pendingOperations() throws -> [PendingSyncOperation] {
        let key = scopeKey
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.createdAt, order: .forward)]
        )
        return try context.fetch(descriptor)
    }

    func sendableOperations() throws -> [PendingSyncOperation] {
        try pendingOperations().filter { $0.status.isSendable }
    }

    func unsettledOperations() throws -> [PendingSyncOperation] {
        try pendingOperations().filter { $0.status != .applied }
    }

    func unsettledOperationCount() throws -> Int {
        try unsettledOperations().count
    }

    func save() throws { try context.save() }

    func delete(_ op: PendingSyncOperation) throws {
        context.delete(op)
        try context.save()
    }

    // MARK: - Scope lifecycle

    /// Wipe every cache row and queued op for this scope. Call on
    /// sign-out so cached records and pending work don't leak into a
    /// different identity's session.
    func purgeScope() throws {
        let key = scopeKey
        try context.delete(model: CachedEvent.self, where: #Predicate { $0.scopeKey == key })
        try context.delete(model: CachedMember.self, where: #Predicate { $0.scopeKey == key })
        try context.delete(model: CachedTeam.self, where: #Predicate { $0.scopeKey == key })
        try context.delete(model: CachedAnnouncement.self, where: #Predicate { $0.scopeKey == key })
        try context.delete(model: CachedPlayerListing.self, where: #Predicate { $0.scopeKey == key })
        try context.delete(model: CachedResource.self, where: #Predicate { $0.scopeKey == key })
        try context.delete(model: PendingSyncOperation.self, where: #Predicate { $0.scopeKey == key })
        try context.save()
    }

    private func cacheValue<T: Encodable>(_ value: T, for resourceKey: String) throws {
        let payload = try JSONEncoder().encode(value)
        let id = CachedResource.cacheId(scopeKey: scopeKey, resourceKey: resourceKey)
        let descriptor = FetchDescriptor<CachedResource>(
            predicate: #Predicate { $0.id == id }
        )
        if let existing = try context.fetch(descriptor).first {
            existing.update(payload: payload)
        } else {
            context.insert(
                CachedResource(
                    scopeKey: scopeKey,
                    resourceKey: resourceKey,
                    payload: payload
                )
            )
        }
        try context.save()
    }

    private func cachedValue<T: Decodable>(
        for resourceKey: String,
        as type: T.Type
    ) throws -> T? {
        let id = CachedResource.cacheId(scopeKey: scopeKey, resourceKey: resourceKey)
        let descriptor = FetchDescriptor<CachedResource>(
            predicate: #Predicate { $0.id == id }
        )
        return try context.fetch(descriptor).first?.decoded(as: type)
    }

    private func hasCachedValue(for resourceKey: String) throws -> Bool {
        let id = CachedResource.cacheId(scopeKey: scopeKey, resourceKey: resourceKey)
        let descriptor = FetchDescriptor<CachedResource>(
            predicate: #Predicate { $0.id == id }
        )
        return try context.fetch(descriptor).first != nil
    }

    private func markCollectionCached(_ key: String) throws {
        try cacheValue(CollectionCacheMarker(cachedAt: .now), for: collectionCacheKey(key))
    }

    private func hasCollectionCache(_ key: String) throws -> Bool {
        try hasCachedValue(for: collectionCacheKey(key))
    }

    private func collectionCacheKey(_ key: String) -> String {
        "collection.\(key)"
    }

    private func assetListKey(status: String?) -> String {
        "assets.list.\(status ?? "all")"
    }
}

private struct CollectionCacheMarker: Codable {
    let cachedAt: Date
}
