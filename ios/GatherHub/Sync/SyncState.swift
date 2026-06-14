import Foundation

/// Kind of queued write. Each value maps to a Convex mutation that the
/// `SyncCoordinator` knows how to submit. Adding a kind here means
/// (1) deciding the payload DTO and (2) handling its branch in the
/// coordinator's `submit(_:)` switch.
enum SyncOperationKind: String, Codable, Sendable, CaseIterable {
    /// `events:setRsvp` — { eventId, memberId, status }
    case rsvp
    /// `events:create` — create a calendar event.
    case eventCreate
    /// `events:update` — edit a calendar event.
    case eventUpdate
    /// `events:remove` — delete a calendar event.
    case eventDelete
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
    /// `soccer:removeEvaluation` — clear one skill score.
    case soccerEvaluationDelete
    /// `soccer:upsertRegistration` — assignment quick-edit payload.
    case soccerAssignment
    /// `assets:create` — create a new asset and optionally bind NFC.
    case assetCreate
    /// `assets:update` — edit asset details.
    case assetUpdate
    /// `assetOps:retire` — retire asset from field use.
    case assetRetire
    /// `assets:remove` — admin hard-delete asset.
    case assetDelete
    /// `organizations:updateLocationSettings` — update default address.
    case orgDefaultAddress
    /// `announcements:create` — post an announcement.
    case announcementCreate
    /// `announcements:update` — edit/pin/unpin an announcement.
    case announcementUpdate
    /// `announcements:remove` — delete an announcement.
    case announcementDelete
    /// `certifications:create` — create a training certification record.
    case trainingCertificationCreate
    /// `certifications:update` — edit a training certification record.
    case trainingCertificationUpdate
    /// `certifications:remove` — delete a training certification record.
    case trainingCertificationDelete
    /// `tasks:create` — create a task-board item.
    case taskCreate
    /// `tasks:update` — edit task details/reminder settings.
    case taskUpdate
    /// `tasks:move` — move a task between board columns.
    case taskMove
    /// `tasks:remove` — delete a task-board item.
    case taskDelete
    /// `members:create` — create a member captured in the field.
    case memberCreate
    /// `members:update` — edit member details/status.
    case memberUpdate
    /// `members:remove` — delete a member and dependent rows.
    case memberDelete
    /// `teams:create` — create a team/squad.
    case teamCreate
    /// `teams:update` — edit or deactivate a team/squad.
    case teamUpdate
    /// `teams:remove` — delete a team/squad.
    case teamDelete
    /// `soccer:upsertRegistration` — full player registration edit.
    case soccerRegistration
    /// `soccer:removeRegistration` — remove a player's registration sidecar.
    case soccerRegistrationDelete
    /// `soccer:createFieldRegistration` — create player + optional guardian/contact + registration.
    case soccerFieldRegistration
    /// `soccer:upsertDivision` — create/edit/deactivate grade band.
    case soccerDivision
    /// `soccer:upsertCompetition` — create/edit/deactivate competition.
    case soccerCompetition
    /// `soccer:createSkill` — create a grading skill.
    case soccerSkillCreate
    /// `soccer:updateSkill` — edit/deactivate a grading skill.
    case soccerSkillUpdate
    /// `taxonomies:create` — create a team age-group taxonomy option.
    case teamAgeGroupCreate
    /// `taxonomies:update` — edit a team age-group label.
    case teamAgeGroupUpdate
    /// `taxonomies:setActive` — activate/deactivate a team age-group.
    case teamAgeGroupSetActive
    /// `matchRosters:updateParticipation` — match-day attendance/participation.
    case matchParticipationUpdate
    /// `fieldService:startJob` — advance a job to en route / on site.
    case fieldStartJob
    /// `fieldService:completeJob` — complete a job with proof-of-service.
    case fieldCompleteJob
    /// `fieldService:raiseException` — mark a job as an exception.
    case fieldRaiseException

    var label: String {
        switch self {
        case .rsvp: return "Event RSVP"
        case .eventCreate: return "Event creation"
        case .eventUpdate: return "Event edit"
        case .eventDelete: return "Event deletion"
        case .assetCheckOut: return "Asset check-out"
        case .assetCheckIn: return "Asset check-in"
        case .assetScan: return "Asset scan"
        case .assetRegisterNfc: return "NFC tag bind"
        case .announcementRead: return "Read receipt"
        case .soccerEvaluation: return "Skill score"
        case .soccerEvaluationDelete: return "Skill score deletion"
        case .soccerAssignment: return "Player assignment"
        case .assetCreate: return "Asset creation"
        case .assetUpdate: return "Asset edit"
        case .assetRetire: return "Asset retirement"
        case .assetDelete: return "Asset deletion"
        case .orgDefaultAddress: return "Organisation address"
        case .announcementCreate: return "Announcement creation"
        case .announcementUpdate: return "Announcement edit"
        case .announcementDelete: return "Announcement deletion"
        case .trainingCertificationCreate: return "Training certification creation"
        case .trainingCertificationUpdate: return "Training certification edit"
        case .trainingCertificationDelete: return "Training certification deletion"
        case .taskCreate: return "Task creation"
        case .taskUpdate: return "Task edit"
        case .taskMove: return "Task move"
        case .taskDelete: return "Task deletion"
        case .memberCreate: return "Member creation"
        case .memberUpdate: return "Member edit"
        case .memberDelete: return "Member deletion"
        case .teamCreate: return "Team creation"
        case .teamUpdate: return "Team edit"
        case .teamDelete: return "Team deletion"
        case .soccerRegistration: return "Player registration"
        case .soccerRegistrationDelete: return "Player registration deletion"
        case .soccerFieldRegistration: return "Field registration"
        case .soccerDivision: return "Division"
        case .soccerCompetition: return "Competition"
        case .soccerSkillCreate: return "Skill creation"
        case .soccerSkillUpdate: return "Skill edit"
        case .teamAgeGroupCreate: return "Age group creation"
        case .teamAgeGroupUpdate: return "Age group edit"
        case .teamAgeGroupSetActive: return "Age group status"
        case .matchParticipationUpdate: return "Match-day participation"
        case .fieldStartJob: return "Job start"
        case .fieldCompleteJob: return "Job completion"
        case .fieldRaiseException: return "Job exception"
        }
    }

    var requiredCapability: String? {
        switch self {
        case .rsvp, .announcementRead:
            return nil
        case .eventCreate, .eventUpdate:
            return "events.write"
        case .eventDelete:
            return "events.delete"
        case .assetCheckOut, .assetCheckIn, .assetScan, .assetRetire:
            return "assets.operate"
        case .assetRegisterNfc, .assetCreate, .assetUpdate, .assetDelete:
            return "assets.admin"
        case .orgDefaultAddress:
            return "settings.admin"
        case .announcementCreate, .announcementUpdate, .announcementDelete:
            return "announcements.write"
        case .trainingCertificationCreate, .trainingCertificationUpdate, .trainingCertificationDelete:
            return "training.manage"
        case .taskCreate, .taskUpdate, .taskMove, .taskDelete:
            return "tasks.manage"
        case .memberCreate, .memberUpdate:
            return "members.write"
        case .memberDelete:
            return "members.delete"
        case .teamCreate, .teamUpdate:
            return "teams.write"
        case .teamDelete:
            return "teams.delete"
        case .soccerEvaluation, .soccerEvaluationDelete:
            return "soccer.grade"
        case .soccerAssignment, .soccerRegistration, .soccerRegistrationDelete,
             .soccerFieldRegistration, .soccerDivision, .soccerCompetition,
             .soccerSkillCreate, .soccerSkillUpdate:
            return "soccer.manage"
        case .teamAgeGroupCreate, .teamAgeGroupUpdate, .teamAgeGroupSetActive:
            return "settings.admin"
        case .matchParticipationUpdate:
            return "events.write"
        case .fieldStartJob, .fieldCompleteJob, .fieldRaiseException:
            return "jobs.complete"
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
