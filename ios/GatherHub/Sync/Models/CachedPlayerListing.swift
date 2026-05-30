import Foundation
import SwiftData

/// Cached registration row so the soccer Player Registrations list
/// reads offline (most useful field surface — match-day lookup).
@Model
final class CachedPlayerListing {
    var memberId: String
    var scopeKey: String
    var name: String
    var registered: Bool
    var paid: Bool
    var payload: Data
    var cachedAt: Date

    init(
        memberId: String,
        scopeKey: String,
        name: String,
        registered: Bool,
        paid: Bool,
        payload: Data,
        cachedAt: Date = .now
    ) {
        self.memberId = memberId
        self.scopeKey = scopeKey
        self.name = name
        self.registered = registered
        self.paid = paid
        self.payload = payload
        self.cachedAt = cachedAt
    }

    convenience init(row: PlayerListingRow, scopeKey: String) throws {
        let payload = try JSONEncoder().encode(row)
        self.init(
            memberId: row.memberId,
            scopeKey: scopeKey,
            name: row.name,
            registered: row.registered,
            paid: row.paid,
            payload: payload
        )
    }

    func decoded() throws -> PlayerListingRow {
        try JSONDecoder().decode(PlayerListingRow.self, from: payload)
    }
}
