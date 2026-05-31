import Foundation
import SwiftData

/// Builds the app's SwiftData `ModelContainer`. Mirrors RangerOS's
/// `RangerDataContainer`: a single store, with every row carrying a
/// `scopeKey` so reads can't leak across tenants.
enum DataContainer {
    static var schema: Schema {
        Schema([
            CachedEvent.self,
            CachedMember.self,
            CachedTeam.self,
            CachedAnnouncement.self,
            CachedPlayerListing.self,
            CachedResource.self,
            PendingSyncOperation.self,
        ])
    }

    /// Build the container. If a pre-existing on-disk store can't open
    /// against the current schema (e.g. a model was added since the
    /// last launch), delete it and recreate — the cache is always
    /// re-fetchable from Convex, so a wipe is acceptable. Falling back
    /// to fatalError on first launch after a schema change would crash
    /// every signed-in user.
    static func make(inMemory: Bool = false) throws -> ModelContainer {
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: inMemory
        )
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            // Wipe the on-disk store and retry. The default store URL
            // sits under Application Support; delete the directory so
            // SwiftData can build a fresh one.
            if !inMemory, let url = defaultStoreURL() {
                try? FileManager.default.removeItem(at: url)
            }
            return try ModelContainer(for: schema, configurations: [configuration])
        }
    }

    private static func defaultStoreURL() -> URL? {
        // SwiftData writes to <Application Support>/default.store by
        // default when no URL is supplied to ModelConfiguration.
        guard let support = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else { return nil }
        return support.appendingPathComponent("default.store")
    }
}
