import Foundation
import Observation

/// Drains the offline write queue to Convex. Adapts RangerOS-iOS's
/// `SyncCoordinator` for our backend.
///
/// Behaviour:
/// - Reads sendable operations (pending + failed) oldest-first.
/// - Decodes the payload by kind, calls the matching Convex mutation.
/// - On success transitions to `applied`; on transient errors `failed`
///   (retries later); on hard errors `rejected` (stays visible).
/// - Nothing is ever silently deleted.
@MainActor
@Observable
final class SyncCoordinator {
    private let convex: ConvexService
    private let store: LocalStore
    private let monitor: NetworkMonitor

    private(set) var isSyncing = false
    private(set) var lastSyncedAt: Date?
    private(set) var unsettledCount: Int = 0

    init(convex: ConvexService, store: LocalStore, monitor: NetworkMonitor) {
        self.convex = convex
        self.store = store
        self.monitor = monitor
        refreshUnsettledCount()
    }

    /// Refresh the badge count without running a drain pass.
    func refreshUnsettledCount() {
        unsettledCount = (try? store.unsettledOperationCount()) ?? 0
    }

    /// Try to drain every sendable operation if we believe we're online.
    /// Called on app foreground, after each enqueue, and when the
    /// connectivity flips back to satisfied.
    func syncIfOnline() async {
        guard monitor.isOnline else { return }
        await sync()
    }

    func sync() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer {
            isSyncing = false
            lastSyncedAt = .now
            refreshUnsettledCount()
        }

        let ops = (try? store.sendableOperations()) ?? []
        for op in ops {
            await process(op)
        }
    }

    private func process(_ op: PendingSyncOperation) async {
        op.transition(to: .submitted)
        try? store.save()
        do {
            switch op.kind {
            case .rsvp:
                let args = try JSONDecoder().decode(RsvpPayload.self, from: op.payload)
                try await convex.setRsvp(
                    eventId: args.eventId,
                    memberId: args.memberId,
                    status: args.status
                )
            case .assetCheckOut:
                let args = try JSONDecoder().decode(CheckOutPayload.self, from: op.payload)
                try await convex.checkOut(
                    assetId: args.assetId,
                    custodianMemberId: args.custodianMemberId,
                    location: args.location,
                    dueBack: args.dueBack,
                    notes: args.notes
                )
            case .assetCheckIn:
                let args = try JSONDecoder().decode(CheckInPayload.self, from: op.payload)
                try await convex.checkIn(
                    assetId: args.assetId,
                    location: args.location,
                    notes: args.notes
                )
            case .assetScan:
                let args = try JSONDecoder().decode(ScanPayload.self, from: op.payload)
                try await convex.recordScan(
                    assetId: args.assetId,
                    latitude: args.latitude,
                    longitude: args.longitude,
                    accuracy: args.accuracy
                )
            case .assetRegisterNfc:
                let args = try JSONDecoder().decode(RegisterNfcPayload.self, from: op.payload)
                try await convex.registerNfc(
                    assetId: args.assetId,
                    nfcTagId: args.nfcTagId
                )
            case .announcementRead:
                let args = try JSONDecoder().decode(AnnouncementReadPayload.self, from: op.payload)
                try await convex.markAnnouncementRead(args.announcementId)
            case .soccerEvaluation:
                let args = try JSONDecoder().decode(EvaluationPayload.self, from: op.payload)
                try await convex.upsertEvaluation(
                    memberId: args.memberId,
                    skillId: args.skillId,
                    score: args.score,
                    notes: args.notes
                )
            case .soccerAssignment:
                let args = try JSONDecoder().decode(AssignmentPayload.self, from: op.payload)
                try await convex.updatePlayerAssignment(
                    memberId: args.memberId,
                    teamId: args.teamId,
                    divisionId: args.divisionId,
                    clearTeam: args.clearTeam,
                    clearDivision: args.clearDivision,
                    kitColour: args.kitColour
                )
            }
            op.transition(to: .applied)
            try? store.save()
        } catch {
            // Convex errors aren't yet distinguishable as
            // transient vs terminal at this level; treat as retryable
            // until we add an isTransient probe to the SDK error type.
            op.attemptCount += 1
            op.transition(to: .failed, message: error.localizedDescription)
            try? store.save()
        }
    }
}

// MARK: - Payload DTOs

struct RsvpPayload: Codable {
    let eventId: String
    let memberId: String
    let status: RsvpStatus
}

struct CheckOutPayload: Codable {
    let assetId: String
    let custodianMemberId: String
    let location: String?
    let dueBack: Date?
    let notes: String?
}

struct CheckInPayload: Codable {
    let assetId: String
    let location: String?
    let notes: String?
}

struct ScanPayload: Codable {
    let assetId: String
    let latitude: Double?
    let longitude: Double?
    let accuracy: Double?
}

struct RegisterNfcPayload: Codable {
    let assetId: String
    let nfcTagId: String
}

struct AnnouncementReadPayload: Codable {
    let announcementId: String
}

struct EvaluationPayload: Codable {
    let memberId: String
    let skillId: String
    let score: Double
    let notes: String?
}

struct AssignmentPayload: Codable {
    let memberId: String
    let teamId: String?
    let divisionId: String?
    let clearTeam: Bool
    let clearDivision: Bool
    let kitColour: String?
}
