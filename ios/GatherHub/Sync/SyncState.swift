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
    /// `assets:create` — create a new asset and optionally bind NFC.
    case assetCreate
    /// `organizations:updateLocationSettings` — update default address.
    case orgDefaultAddress
    /// `members:create` — create a member captured in the field.
    case memberCreate
    /// `members:update` — edit member details/status.
    case memberUpdate
    /// `teams:create` — create a team/squad.
    case teamCreate
    /// `teams:update` — edit or deactivate a team/squad.
    case teamUpdate
    /// `soccer:upsertRegistration` — full player registration edit.
    case soccerRegistration
    /// `soccer:createFieldRegistration` — create player + optional guardian/contact + registration.
    case soccerFieldRegistration
    /// `soccer:upsertDivision` — create/edit/deactivate grade band.
    case soccerDivision
    /// `taxonomies:create` — create a team age-group taxonomy option.
    case teamAgeGroupCreate
    /// `taxonomies:update` — edit a team age-group label.
    case teamAgeGroupUpdate
    /// `taxonomies:setActive` — activate/deactivate a team age-group.
    case teamAgeGroupSetActive

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
        case .assetCreate: return "Asset creation"
        case .orgDefaultAddress: return "Organisation address"
        case .memberCreate: return "Member creation"
        case .memberUpdate: return "Member edit"
        case .teamCreate: return "Team creation"
        case .teamUpdate: return "Team edit"
        case .soccerRegistration: return "Player registration"
        case .soccerFieldRegistration: return "Field registration"
        case .soccerDivision: return "Division"
        case .teamAgeGroupCreate: return "Age group creation"
        case .teamAgeGroupUpdate: return "Age group edit"
        case .teamAgeGroupSetActive: return "Age group status"
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

    var isSendable: Bool { self == .pending || self == .failed || self == .submitted }
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
