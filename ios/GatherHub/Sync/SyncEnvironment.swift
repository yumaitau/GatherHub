import Foundation
import SwiftData

/// Long-lived container for the offline sync stack. The `ModelContainer`
/// is built once at launch (lives for the whole process). `LocalStore`
/// and `SyncCoordinator` are recreated as the active scope flips —
/// they're cheap to make.
@MainActor
final class SyncEnvironment: ObservableObject {
    let modelContainer: ModelContainer
    let monitor: NetworkMonitor

    @Published private(set) var store: LocalStore?
    @Published private(set) var coordinator: SyncCoordinator?

    init() {
        do {
            self.modelContainer = try DataContainer.make()
        } catch {
            // SwiftData container failures at boot are fatal — there's
            // nothing useful to fall back to. Surfacing the dump aids
            // diagnosis vs an opaque crash.
            dump(error)
            fatalError("Could not create SwiftData container: \(error)")
        }
        self.monitor = NetworkMonitor()
    }

    /// Bind the scope to a freshly synced context. Re-creates the
    /// LocalStore and SyncCoordinator against the new scopeKey.
    func bind(clerkUserId: String, orgId: String, convex: ConvexService) {
        let scopeKey = "\(clerkUserId)#\(orgId)"
        let context = modelContainer.mainContext
        let store = LocalStore(context: context, scopeKey: scopeKey)
        self.store = store
        self.coordinator = SyncCoordinator(
            convex: convex,
            store: store,
            monitor: monitor
        )
    }

    /// Sign-out / org switch lifecycle. Purges the current scope's
    /// cache + queue and drops the helpers.
    func unbind() {
        try? store?.purgeScope()
        store = nil
        coordinator = nil
    }
}
