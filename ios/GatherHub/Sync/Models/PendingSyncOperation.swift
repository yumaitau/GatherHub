import Foundation
import SwiftData

/// A single queued write awaiting submission to Convex. Adapts the
/// RangerOS-iOS pattern (`RangerKitData/Models/PendingSyncOperation`)
/// for our Convex backend.
///
/// `payload` holds the encoded mutation arguments as JSON. `clientId`
/// is a stable idempotency key — a retry of the same logical write
/// reuses it, so Convex (which we'll teach to dedup on this field) can
/// recognise duplicates.
@Model
final class PendingSyncOperation {
    /// Local operation id (UUID string). Distinct from `clientId`.
    @Attribute(.unique) var id: String
    /// Tenant + identity scope: `clerkUserId#orgId`. Defends against
    /// cross-org / cross-user leakage on a shared device.
    var scopeKey: String
    var kindRaw: String
    /// Stable idempotency key. Same across retries of the same logical
    /// operation. Server-side dedup keys on this value.
    var clientId: String
    /// Short human label for the queue UI.
    var title: String
    /// Encoded mutation arguments.
    var payload: Data
    var statusRaw: String
    var attemptCount: Int
    var lastErrorMessage: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        scopeKey: String,
        kind: SyncOperationKind,
        clientId: String = UUID().uuidString,
        title: String,
        payload: Data,
        status: SyncOperationStatus = .pending,
        attemptCount: Int = 0,
        createdAt: Date = .now
    ) {
        self.id = id
        self.scopeKey = scopeKey
        self.kindRaw = kind.rawValue
        self.clientId = clientId
        self.title = title
        self.payload = payload
        self.statusRaw = status.rawValue
        self.attemptCount = attemptCount
        self.lastErrorMessage = nil
        self.createdAt = createdAt
        self.updatedAt = createdAt
    }

    var kind: SyncOperationKind {
        SyncOperationKind(rawValue: kindRaw) ?? .rsvp
    }

    var status: SyncOperationStatus {
        get { SyncOperationStatus(rawValue: statusRaw) ?? .pending }
        set { statusRaw = newValue.rawValue }
    }

    func transition(to status: SyncOperationStatus, message: String? = nil) {
        self.status = status
        self.lastErrorMessage = message
        self.updatedAt = .now
    }
}
