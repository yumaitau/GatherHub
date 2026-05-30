import Foundation
import SwiftData

/// Locally cached event so the calendar reads offline. Stores the full
/// event JSON in `payload` plus a handful of indexed columns for
/// offline sorting. `scopeKey` is `clerkUserId#orgId` so a query can
/// never bleed across tenants on a shared device.
@Model
final class CachedEvent {
    /// Server `_id` of the event.
    var id: String
    /// `clerkUserId#orgId`.
    var scopeKey: String
    var title: String
    var startTime: Double
    var endTime: Double?
    var typeRaw: String
    /// Encoded `Event` JSON.
    var payload: Data
    var cachedAt: Date

    init(
        id: String,
        scopeKey: String,
        title: String,
        startTime: Double,
        endTime: Double?,
        typeRaw: String,
        payload: Data,
        cachedAt: Date = .now
    ) {
        self.id = id
        self.scopeKey = scopeKey
        self.title = title
        self.startTime = startTime
        self.endTime = endTime
        self.typeRaw = typeRaw
        self.payload = payload
        self.cachedAt = cachedAt
    }

    /// Build a cache row from a domain `Event`.
    convenience init(event: Event, scopeKey: String) throws {
        let payload = try JSONEncoder().encode(event)
        self.init(
            id: event.id,
            scopeKey: scopeKey,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
            typeRaw: event.type.rawValue,
            payload: payload
        )
    }

    /// Decode the payload back to a domain `Event`.
    func decoded() throws -> Event {
        try JSONDecoder().decode(Event.self, from: payload)
    }
}
