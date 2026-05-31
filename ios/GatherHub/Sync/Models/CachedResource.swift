import Foundation
import SwiftData

/// Generic scoped cache entry for read models that do not need their own
/// indexed SwiftData model. The cache key is deterministic so writes upsert
/// instead of accumulating duplicate snapshots.
@Model
final class CachedResource {
    @Attribute(.unique) var id: String
    var scopeKey: String
    var resourceKey: String
    var payload: Data
    var cachedAt: Date

    init(
        scopeKey: String,
        resourceKey: String,
        payload: Data,
        cachedAt: Date = .now
    ) {
        self.id = CachedResource.cacheId(scopeKey: scopeKey, resourceKey: resourceKey)
        self.scopeKey = scopeKey
        self.resourceKey = resourceKey
        self.payload = payload
        self.cachedAt = cachedAt
    }

    static func cacheId(scopeKey: String, resourceKey: String) -> String {
        "\(scopeKey)|\(resourceKey)"
    }

    func update(payload: Data, cachedAt: Date = .now) {
        self.payload = payload
        self.cachedAt = cachedAt
    }

    func decoded<T: Decodable>(as type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: payload)
    }
}
