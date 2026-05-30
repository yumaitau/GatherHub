import Foundation
import SwiftData

/// Cached member row so the Members list reads offline. Stores the
/// full Member as JSON plus a few denormalised columns for offline
/// sorting/filtering. Scoped by `scopeKey` (clerkUserId#orgId).
@Model
final class CachedMember {
    var id: String
    var scopeKey: String
    var firstName: String
    var lastName: String
    var email: String?
    var statusRaw: String
    var isVolunteer: Bool
    var payload: Data
    var cachedAt: Date

    init(
        id: String,
        scopeKey: String,
        firstName: String,
        lastName: String,
        email: String?,
        statusRaw: String,
        isVolunteer: Bool,
        payload: Data,
        cachedAt: Date = .now
    ) {
        self.id = id
        self.scopeKey = scopeKey
        self.firstName = firstName
        self.lastName = lastName
        self.email = email
        self.statusRaw = statusRaw
        self.isVolunteer = isVolunteer
        self.payload = payload
        self.cachedAt = cachedAt
    }

    convenience init(member: Member, scopeKey: String) throws {
        let payload = try JSONEncoder().encode(member)
        self.init(
            id: member.id,
            scopeKey: scopeKey,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            statusRaw: member.status.rawValue,
            isVolunteer: member.isVolunteer ?? false,
            payload: payload
        )
    }

    func decoded() throws -> Member {
        try JSONDecoder().decode(Member.self, from: payload)
    }
}
