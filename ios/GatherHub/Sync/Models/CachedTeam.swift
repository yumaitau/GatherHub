import Foundation
import SwiftData

/// Cached team row so the Teams list reads offline.
@Model
final class CachedTeam {
    var id: String
    var scopeKey: String
    var name: String
    var isActive: Bool
    var payload: Data
    var cachedAt: Date

    init(
        id: String,
        scopeKey: String,
        name: String,
        isActive: Bool,
        payload: Data,
        cachedAt: Date = .now
    ) {
        self.id = id
        self.scopeKey = scopeKey
        self.name = name
        self.isActive = isActive
        self.payload = payload
        self.cachedAt = cachedAt
    }

    convenience init(team: Team, scopeKey: String) throws {
        let payload = try JSONEncoder().encode(team)
        self.init(
            id: team.id,
            scopeKey: scopeKey,
            name: team.name,
            isActive: team.isActive,
            payload: payload
        )
    }

    func decoded() throws -> Team {
        try JSONDecoder().decode(Team.self, from: payload)
    }
}
