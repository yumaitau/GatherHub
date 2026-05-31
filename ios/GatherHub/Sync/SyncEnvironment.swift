import Foundation
import Combine
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
    private var currentScopeKey: String?
    private var currentClerkUserId: String?

    private let defaults: UserDefaults
    private let cachedContextPrefix = "au.gatherhub.cachedContext."

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        do {
            self.modelContainer = try DataContainer.make()
        } catch {
            // SwiftData container failures at boot are fatal — there's
            // nothing useful to fall back to. Surfacing the dump aids
            // diagnosis vs an opaque crash.
            #if DEBUG
            debugPrint(UserFacingError.message(error))
            #endif
            fatalError("Could not create SwiftData container: \(error)")
        }
        let monitor = NetworkMonitor()
        self.monitor = monitor
        monitor.onStatusChange = { [weak self] in
            self?.objectWillChange.send()
        }
    }

    /// Bind the scope to a freshly synced context. Re-creates the
    /// LocalStore and SyncCoordinator against the new scopeKey.
    func bind(clerkUserId: String, orgId: String, convex: ConvexService) {
        let scopeKey = "\(clerkUserId)#\(orgId)"
        if currentScopeKey == scopeKey, store != nil, coordinator != nil {
            return
        }
        let context = modelContainer.mainContext
        let store = LocalStore(context: context, scopeKey: scopeKey)
        self.currentScopeKey = scopeKey
        self.currentClerkUserId = clerkUserId
        self.store = store
        let coordinator = SyncCoordinator(
            convex: convex,
            store: store,
            monitor: monitor
        )
        coordinator.onStateChange = { [weak self] in
            self?.objectWillChange.send()
        }
        self.coordinator = coordinator
    }

    @discardableResult
    func enqueue<P: Encodable>(
        kind: SyncOperationKind,
        title: String,
        payload: P,
        clientId: String = UUID().uuidString
    ) throws -> PendingSyncOperation {
        guard let store else { throw SyncQueueError.unavailable }
        let data = try JSONEncoder().encode(payload)
        let op = try store.enqueue(kind: kind, title: title, payload: data, clientId: clientId)
        coordinator?.refreshUnsettledCount()
        return op
    }

    func rememberContext(_ context: CurrentContext, clerkUserId: String) {
        if let data = try? JSONEncoder().encode(context) {
            defaults.set(data, forKey: cachedContextKey(clerkUserId: clerkUserId))
        }
    }

    func cachedContext(clerkUserId: String) -> CurrentContext? {
        guard let data = defaults.data(forKey: cachedContextKey(clerkUserId: clerkUserId)) else {
            return nil
        }
        return try? JSONDecoder().decode(CurrentContext.self, from: data)
    }

    func forgetCachedContext(clerkUserId: String) {
        defaults.removeObject(forKey: cachedContextKey(clerkUserId: clerkUserId))
    }

    /// Sign-out / org switch lifecycle. Purges the current scope's
    /// cache + queue and drops the helpers.
    func unbind(purge: Bool = true) {
        if purge {
            try? store?.purgeScope()
            if let currentClerkUserId {
                forgetCachedContext(clerkUserId: currentClerkUserId)
            }
        }
        currentScopeKey = nil
        currentClerkUserId = nil
        store = nil
        coordinator = nil
    }

    private func cachedContextKey(clerkUserId: String) -> String {
        cachedContextPrefix + clerkUserId
    }
}

enum SyncQueueError: LocalizedError {
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unavailable:
            "Offline storage is not ready yet. Reopen the app and try again."
        }
    }
}
