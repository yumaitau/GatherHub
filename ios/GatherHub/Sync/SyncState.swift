import Foundation

/// Kind of queued write. Each value maps to a Convex mutation that the
/// `SyncCoordinator` knows how to submit. Adding a kind here means
/// (1) deciding the payload DTO and (2) handling its branch in the
/// coordinator's `submit(_:)` switch.
enum SyncOperationKind: String, Codable, Sendable, CaseIterable {
    /// `events:setRsvp` — { eventId, memberId, status }
    case rsvp
    /// `assetOps:checkOut` — { assetId, custodianMemberId, ... }
    case assetCheckOut
    /// `assetOps:checkIn` — { assetId, ... }
    case assetCheckIn
    /// `assetOps:recordScan` — { assetId, lat?, lng?, accuracy? }
    case assetScan
    /// `assets:registerNfc` — { assetId, nfcTagId }
    case assetRegisterNfc
    /// `announcements:markRead` — { announcementId }
    case announcementRead
    /// `soccer:upsertEvaluation` — { memberId, skillId, score, notes? }
    case soccerEvaluation
    /// `soccer:upsertRegistration` — assignment quick-edit payload.
    case soccerAssignment

    var label: String {
        switch self {
        case .rsvp: return "Event RSVP"
        case .assetCheckOut: return "Asset check-out"
        case .assetCheckIn: return "Asset check-in"
        case .assetScan: return "Asset scan"
        case .assetRegisterNfc: return "NFC tag bind"
        case .announcementRead: return "Read receipt"
        case .soccerEvaluation: return "Skill score"
        case .soccerAssignment: return "Player assignment"
        }
    }
}

/// Lifecycle state of a queued operation. Mirrors RangerOS's pattern:
/// nothing is ever silently dropped — failed/rejected items stay in the
/// queue so the user can inspect them on a sync screen.
enum SyncOperationStatus: String, Codable, Sendable, CaseIterable {
    /// Saved locally, awaiting submission.
    case pending
    /// Sent to Convex; awaiting response.
    case submitted
    /// Accepted by the server (terminal, success).
    case applied
    /// Server returned a hard error (forbidden / not found / invalid).
    case rejected
    /// Transient failure (network or 5xx). Eligible for automatic retry.
    case failed

    var isSendable: Bool { self == .pending || self == .failed }
    var isTerminal: Bool { self == .applied || self == .rejected }

    var label: String {
        switch self {
        case .pending: return "Pending"
        case .submitted: return "Submitting…"
        case .applied: return "Applied"
        case .rejected: return "Rejected"
        case .failed: return "Failed — will retry"
        }
    }
}
