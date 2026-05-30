import Foundation
import SwiftData

/// Scoped read/write access to the local cache + sync queue.
///
/// Every method is constrained to a single `scopeKey` (`clerkUserId#orgId`),
/// the same defence RangerOS uses against cross-org / cross-user
/// leakage on a shared device. The scope flips on sign-in or org-switch;
/// on sign-out the scope is purged.
@MainActor
final class LocalStore {
    private let context: ModelContext
    private(set) var scopeKey: String

    init(context: ModelContext, scopeKey: String) {
        self.context = context
        self.scopeKey = scopeKey
    }

    /// Flip the active scope (e.g. user switched clubs). Cached rows for
    /// the previous scope stay on disk but are unreachable through this
    /// instance until the scope flips back.
    func setScope(_ newScope: String) {
        scopeKey = newScope
    }

    // MARK: - Events

    func replaceEvents(_ events: [Event]) throws {
        let key = scopeKey
        try context.delete(
            model: CachedEvent.self,
            where: #Predicate { $0.scopeKey == key }
        )
        for event in events {
            context.insert(try CachedEvent(event: event, scopeKey: key))
        }
        try context.save()
    }

    func cachedEvents() throws -> [Event] {
        let key = scopeKey
        let descriptor = FetchDescriptor<CachedEvent>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.startTime, order: .forward)]
        )
        return try context.fetch(descriptor).compactMap { try? $0.decoded() }
    }

    // MARK: - Sync queue

    @discardableResult
    func enqueue(
        kind: SyncOperationKind,
        title: String,
        payload: Data,
        clientId: String = UUID().uuidString
    ) throws -> PendingSyncOperation {
        let op = PendingSyncOperation(
            scopeKey: scopeKey,
            kind: kind,
            clientId: clientId,
            title: title,
            payload: payload
        )
        context.insert(op)
        try context.save()
        return op
    }

    func pendingOperations() throws -> [PendingSyncOperation] {
        let key = scopeKey
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.scopeKey == key },
            sortBy: [SortDescriptor(\.createdAt, order: .forward)]
        )
        return try context.fetch(descriptor)
    }

    func sendableOperations() throws -> [PendingSyncOperation] {
        try pendingOperations().filter { $0.status.isSendable }
    }

    func unsettledOperationCount() throws -> Int {
        try pendingOperations().filter { $0.status != .applied }.count
    }

    func save() throws { try context.save() }

    func delete(_ op: PendingSyncOperation) throws {
        context.delete(op)
        try context.save()
    }

    // MARK: - Scope lifecycle

    /// Wipe every cache row and queued op for this scope. Call on
    /// sign-out so cached records and pending work don't leak into a
    /// different identity's session.
    func purgeScope() throws {
        let key = scopeKey
        try context.delete(model: CachedEvent.self, where: #Predicate { $0.scopeKey == key })
        try context.delete(model: PendingSyncOperation.self, where: #Predicate { $0.scopeKey == key })
        try context.save()
    }
}
