import Foundation
import SwiftData

/// Cached announcement so the feed reads offline.
@Model
final class CachedAnnouncement {
    var id: String
    var scopeKey: String
    var title: String
    var pinned: Bool
    var isRead: Bool
    var creationTime: Double
    var payload: Data
    var cachedAt: Date

    init(
        id: String,
        scopeKey: String,
        title: String,
        pinned: Bool,
        isRead: Bool,
        creationTime: Double,
        payload: Data,
        cachedAt: Date = .now
    ) {
        self.id = id
        self.scopeKey = scopeKey
        self.title = title
        self.pinned = pinned
        self.isRead = isRead
        self.creationTime = creationTime
        self.payload = payload
        self.cachedAt = cachedAt
    }

    convenience init(announcement: Announcement, scopeKey: String) throws {
        let payload = try JSONEncoder().encode(announcement)
        self.init(
            id: announcement.id,
            scopeKey: scopeKey,
            title: announcement.title,
            pinned: announcement.pinned,
            isRead: announcement.isRead,
            creationTime: announcement.creationTime,
            payload: payload
        )
    }

    func decoded() throws -> Announcement {
        try JSONDecoder().decode(Announcement.self, from: payload)
    }
}
