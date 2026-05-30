import Foundation
import SwiftData

/// Builds the app's SwiftData `ModelContainer`. Mirrors RangerOS's
/// `RangerDataContainer`: a single store, with every row carrying a
/// `scopeKey` so reads can't leak across tenants.
enum DataContainer {
    static var schema: Schema {
        Schema([
            CachedEvent.self,
            PendingSyncOperation.self,
        ])
    }

    static func make(inMemory: Bool = false) throws -> ModelContainer {
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: inMemory
        )
        return try ModelContainer(for: schema, configurations: [configuration])
    }
}
