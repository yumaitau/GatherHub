import Foundation
import Observation

/// Drains the offline write queue to Convex. Adapts RangerOS-iOS's
/// `SyncCoordinator` for our backend.
///
/// Behaviour:
/// - Reads sendable operations (pending + failed + submitted) oldest-first.
/// - Decodes the payload by kind, calls the matching Convex mutation.
/// - On success transitions to `applied`; on errors `failed`
///   (retryable and still visible).
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
    @ObservationIgnored
    var onStateChange: (() -> Void)?

    init(convex: ConvexService, store: LocalStore, monitor: NetworkMonitor) {
        self.convex = convex
        self.store = store
        self.monitor = monitor
        refreshUnsettledCount()
    }

    /// Refresh the badge count without running a drain pass.
    func refreshUnsettledCount() {
        unsettledCount = (try? store.unsettledOperationCount()) ?? 0
        onStateChange?()
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
        onStateChange?()
        defer {
            isSyncing = false
            lastSyncedAt = .now
            refreshUnsettledCount()
            onStateChange?()
        }

        let ops = (try? store.sendableOperations()) ?? []
        for op in ops {
            await process(op)
        }
    }

    private func process(_ op: PendingSyncOperation) async {
        op.transition(to: .submitted)
        try? store.save()
        refreshUnsettledCount()
        do {
            switch op.kind {
            case .rsvp:
                let args = try JSONDecoder().decode(RsvpPayload.self, from: op.payload)
                try await convex.setRsvp(
                    eventId: args.eventId,
                    memberId: args.memberId,
                    status: args.status,
                    clientMutationId: op.clientId
                )
                await refreshEventsCache()
            case .eventCreate:
                let args = try JSONDecoder().decode(EventMutationPayload.self, from: op.payload)
                try await convex.createEvent(args, clientMutationId: op.clientId)
                await refreshEventsCache()
            case .eventUpdate:
                let args = try JSONDecoder().decode(EventUpdatePayload.self, from: op.payload)
                try await convex.updateEvent(
                    eventId: args.eventId,
                    payload: args.event,
                    clientMutationId: op.clientId
                )
                await refreshEventsCache()
            case .eventDelete:
                let args = try JSONDecoder().decode(EventDeletePayload.self, from: op.payload)
                try await convex.removeEvent(eventId: args.eventId, clientMutationId: op.clientId)
                await refreshEventsCache()
            case .assetCheckOut:
                let args = try JSONDecoder().decode(CheckOutPayload.self, from: op.payload)
                try await convex.checkOut(
                    assetId: args.assetId,
                    custodianMemberId: args.custodianMemberId,
                    location: args.location,
                    dueBack: args.dueBack,
                    notes: args.notes,
                    clientMutationId: op.clientId
                )
                await refreshAssetListCaches()
            case .assetCheckIn:
                let args = try JSONDecoder().decode(CheckInPayload.self, from: op.payload)
                try await convex.checkIn(
                    assetId: args.assetId,
                    location: args.location,
                    notes: args.notes,
                    clientMutationId: op.clientId
                )
                await refreshAssetListCaches()
            case .assetScan:
                let args = try JSONDecoder().decode(ScanPayload.self, from: op.payload)
                try await convex.recordScan(
                    assetId: args.assetId,
                    latitude: args.latitude,
                    longitude: args.longitude,
                    accuracy: args.accuracy,
                    clientMutationId: op.clientId
                )
            case .assetRegisterNfc:
                let args = try JSONDecoder().decode(RegisterNfcPayload.self, from: op.payload)
                try await convex.registerNfc(
                    assetId: args.assetId,
                    nfcTagId: args.nfcTagId,
                    clientMutationId: op.clientId
                )
                await refreshRegisteredTagCaches(tagId: args.nfcTagId)
            case .announcementRead:
                let args = try JSONDecoder().decode(AnnouncementReadPayload.self, from: op.payload)
                try await convex.markAnnouncementRead(
                    args.announcementId,
                    clientMutationId: op.clientId
                )
                await refreshAnnouncementsCache()
            case .soccerEvaluation:
                let args = try JSONDecoder().decode(EvaluationPayload.self, from: op.payload)
                try await convex.upsertEvaluation(
                    memberId: args.memberId,
                    skillId: args.skillId,
                    score: args.score,
                    notes: args.notes,
                    clientMutationId: op.clientId
                )
                await refreshSoccerEvaluationCaches(memberId: args.memberId)
            case .soccerEvaluationDelete:
                let args = try JSONDecoder().decode(EvaluationDeletePayload.self, from: op.payload)
                try await convex.removeEvaluation(
                    memberId: args.memberId,
                    skillId: args.skillId,
                    clientMutationId: op.clientId
                )
                await refreshSoccerEvaluationCaches(memberId: args.memberId)
            case .soccerAssignment:
                let args = try JSONDecoder().decode(AssignmentPayload.self, from: op.payload)
                try await convex.updatePlayerAssignment(
                    memberId: args.memberId,
                    teamId: args.teamId,
                    divisionId: args.divisionId,
                    clearTeam: args.clearTeam,
                    clearDivision: args.clearDivision,
                    kitColour: args.kitColour,
                    clientMutationId: op.clientId
                )
                await refreshPlayerListingCache()
            case .assetCreate:
                let args = try JSONDecoder().decode(CreateAssetPayload.self, from: op.payload)
                let assetId = try await convex.createAsset(
                    name: args.name,
                    category: args.category,
                    description: args.description,
                    serialNumber: args.serialNumber,
                    condition: args.condition,
                    location: args.location,
                    notes: args.notes,
                    nfcTagId: args.nfcTagId,
                    clientMutationId: op.clientId
                )
                await refreshCreatedAssetCaches(assetId: assetId, tagId: args.nfcTagId)
            case .assetUpdate:
                let args = try JSONDecoder().decode(AssetUpdatePayload.self, from: op.payload)
                try await convex.updateAsset(
                    assetId: args.assetId,
                    payload: args.asset,
                    clientMutationId: op.clientId
                )
                await refreshAssetListCaches()
            case .assetRetire:
                let args = try JSONDecoder().decode(AssetLifecyclePayload.self, from: op.payload)
                try await convex.retireAsset(
                    assetId: args.assetId,
                    notes: args.notes,
                    clientMutationId: op.clientId
                )
                await refreshAssetListCaches()
            case .assetDelete:
                let args = try JSONDecoder().decode(AssetDeletePayload.self, from: op.payload)
                try await convex.removeAsset(assetId: args.assetId, clientMutationId: op.clientId)
                await refreshAssetListCaches()
            case .orgDefaultAddress:
                let args = try JSONDecoder().decode(OrgDefaultAddressPayload.self, from: op.payload)
                try await convex.updateDefaultAddress(
                    args.defaultAddress,
                    clientMutationId: op.clientId
                )
                await refreshLocationDefaultsCache()
            case .announcementCreate:
                let args = try JSONDecoder().decode(AnnouncementMutationPayload.self, from: op.payload)
                try await convex.createAnnouncement(args, clientMutationId: op.clientId)
                await refreshAnnouncementsCache()
            case .announcementUpdate:
                let args = try JSONDecoder().decode(AnnouncementUpdatePayload.self, from: op.payload)
                try await convex.updateAnnouncement(
                    announcementId: args.announcementId,
                    payload: args.announcement,
                    clientMutationId: op.clientId
                )
                await refreshAnnouncementsCache()
            case .announcementDelete:
                let args = try JSONDecoder().decode(AnnouncementDeletePayload.self, from: op.payload)
                try await convex.removeAnnouncement(
                    announcementId: args.announcementId,
                    clientMutationId: op.clientId
                )
                await refreshAnnouncementsCache()
            case .trainingCertificationCreate:
                let args = try JSONDecoder().decode(TrainingCertificationMutationPayload.self, from: op.payload)
                try await convex.createTrainingCertification(args, clientMutationId: op.clientId)
                await refreshTrainingCertificationCaches()
            case .trainingCertificationUpdate:
                let args = try JSONDecoder().decode(TrainingCertificationUpdatePayload.self, from: op.payload)
                try await convex.updateTrainingCertification(
                    certId: args.certId,
                    payload: args.certification,
                    clientMutationId: op.clientId
                )
                await refreshTrainingCertificationCaches()
            case .trainingCertificationDelete:
                let args = try JSONDecoder().decode(TrainingCertificationDeletePayload.self, from: op.payload)
                try await convex.removeTrainingCertification(
                    certId: args.certId,
                    clientMutationId: op.clientId
                )
                await refreshTrainingCertificationCaches()
            case .taskCreate:
                let args = try JSONDecoder().decode(TaskMutationPayload.self, from: op.payload)
                try await convex.createTask(args, clientMutationId: op.clientId)
                await refreshTaskCaches()
            case .taskUpdate:
                let args = try JSONDecoder().decode(TaskUpdatePayload.self, from: op.payload)
                try await convex.updateTask(
                    taskId: args.taskId,
                    payload: args.task,
                    clientMutationId: op.clientId
                )
                await refreshTaskCaches()
            case .taskMove:
                let args = try JSONDecoder().decode(TaskMovePayload.self, from: op.payload)
                try await convex.moveTask(
                    taskId: args.taskId,
                    status: args.status,
                    clientMutationId: op.clientId
                )
                await refreshTaskCaches()
            case .taskDelete:
                let args = try JSONDecoder().decode(TaskDeletePayload.self, from: op.payload)
                try await convex.removeTask(taskId: args.taskId, clientMutationId: op.clientId)
                await refreshTaskCaches()
            case .memberCreate:
                let args = try JSONDecoder().decode(MemberMutationPayload.self, from: op.payload)
                try await convex.createMember(args, clientMutationId: op.clientId)
                await refreshMemberCaches()
            case .memberUpdate:
                let args = try JSONDecoder().decode(MemberUpdatePayload.self, from: op.payload)
                try await convex.updateMember(
                    memberId: args.memberId,
                    payload: args.member,
                    clientMutationId: op.clientId
                )
                await refreshMemberCaches()
            case .memberDelete:
                let args = try JSONDecoder().decode(MemberDeletePayload.self, from: op.payload)
                try await convex.removeMember(memberId: args.memberId, clientMutationId: op.clientId)
                await refreshMemberCaches()
            case .teamCreate:
                let args = try JSONDecoder().decode(TeamMutationPayload.self, from: op.payload)
                try await convex.createTeam(args, clientMutationId: op.clientId)
                await refreshTeamCaches()
            case .teamUpdate:
                let args = try JSONDecoder().decode(TeamUpdatePayload.self, from: op.payload)
                try await convex.updateTeam(
                    teamId: args.teamId,
                    payload: args.team,
                    clientMutationId: op.clientId
                )
                await refreshTeamCaches()
            case .teamDelete:
                let args = try JSONDecoder().decode(TeamDeletePayload.self, from: op.payload)
                try await convex.removeTeam(teamId: args.teamId, clientMutationId: op.clientId)
                await refreshTeamCaches()
            case .soccerRegistration:
                let args = try JSONDecoder().decode(RegistrationMutationPayload.self, from: op.payload)
                try await convex.upsertRegistration(args, clientMutationId: op.clientId)
                await refreshRegistrationCaches(memberId: args.memberId)
            case .soccerRegistrationDelete:
                let args = try JSONDecoder().decode(RegistrationDeletePayload.self, from: op.payload)
                try await convex.removeRegistration(
                    memberId: args.memberId,
                    clientMutationId: op.clientId
                )
                await refreshRegistrationCaches(memberId: args.memberId)
            case .soccerFieldRegistration:
                let args = try JSONDecoder().decode(FieldRegistrationPayload.self, from: op.payload)
                try await convex.createFieldRegistration(args, clientMutationId: op.clientId)
                await refreshFieldRegistrationCaches()
            case .soccerDivision:
                let args = try JSONDecoder().decode(DivisionMutationPayload.self, from: op.payload)
                try await convex.upsertSoccerDivision(args, clientMutationId: op.clientId)
                await refreshSoccerSetupCaches()
            case .soccerCompetition:
                let args = try JSONDecoder().decode(CompetitionMutationPayload.self, from: op.payload)
                try await convex.upsertSoccerCompetition(args, clientMutationId: op.clientId)
                await refreshSoccerSetupCaches()
            case .soccerSkillCreate:
                let args = try JSONDecoder().decode(SkillMutationPayload.self, from: op.payload)
                try await convex.createSoccerSkill(args, clientMutationId: op.clientId)
                await refreshSoccerSkillCaches()
            case .soccerSkillUpdate:
                let args = try JSONDecoder().decode(SkillUpdatePayload.self, from: op.payload)
                try await convex.updateSoccerSkill(
                    skillId: args.skillId,
                    payload: args.skill,
                    clientMutationId: op.clientId
                )
                await refreshSoccerSkillCaches()
            case .teamAgeGroupCreate:
                let args = try JSONDecoder().decode(AgeGroupMutationPayload.self, from: op.payload)
                try await convex.createTeamAgeGroup(label: args.label, clientMutationId: op.clientId)
                await refreshAgeGroupCaches()
            case .teamAgeGroupUpdate:
                let args = try JSONDecoder().decode(AgeGroupUpdatePayload.self, from: op.payload)
                try await convex.updateTeamAgeGroup(
                    id: args.id,
                    label: args.label,
                    clientMutationId: op.clientId
                )
                await refreshAgeGroupCaches()
            case .teamAgeGroupSetActive:
                let args = try JSONDecoder().decode(AgeGroupActivePayload.self, from: op.payload)
                try await convex.setTeamAgeGroupActive(
                    id: args.id,
                    active: args.active,
                    clientMutationId: op.clientId
                )
                await refreshAgeGroupCaches()
            case .matchParticipationUpdate:
                let args = try JSONDecoder().decode(MatchParticipationPayload.self, from: op.payload)
                try await convex.updateMatchParticipation(args, clientMutationId: op.clientId)
                await refreshMatchDayCaches()
            case .fleetInspection:
                let args = try JSONDecoder().decode(FleetInspectionPayload.self, from: op.payload)
                try await convex.recordFleetInspection(
                    assetId: args.assetId,
                    type: args.type,
                    result: args.result,
                    odometer: args.odometer,
                    engineHours: args.engineHours,
                    notes: args.notes,
                    latitude: args.latitude,
                    longitude: args.longitude,
                    accuracy: args.accuracy,
                    clientMutationId: op.clientId
                )
                await refreshAssetListCaches()
            case .fleetDefect:
                let args = try JSONDecoder().decode(FleetDefectPayload.self, from: op.payload)
                try await convex.reportFleetDefect(
                    assetId: args.assetId,
                    severity: args.severity,
                    title: args.title,
                    description: args.description,
                    clientMutationId: op.clientId
                )
                await refreshAssetListCaches()
            }
            op.transition(to: .applied)
            try? store.save()
            refreshUnsettledCount()
        } catch {
            // Convex errors aren't yet distinguishable as
            // transient vs terminal at this level; treat as retryable
            // until we add an isTransient probe to the SDK error type.
            op.attemptCount += 1
            op.transition(
                to: .failed,
                message: UserFacingError.message(error, fallback: "Couldn't sync this change.")
            )
            try? store.save()
            refreshUnsettledCount()
        }
    }

    private func refreshEventsCache() async {
        if let rows = try? await convex.listEvents(upcomingOnly: false) {
            try? store.replaceEvents(rows)
        }
    }

    private func refreshAssetListCaches() async {
        if let rows = try? await convex.listAssets() {
            try? store.replaceAssets(rows)
        }
        if let rows = try? await convex.checkedOutAssets() {
            try? store.replaceCheckedOutAssets(rows)
        }
    }

    private func refreshRegisteredTagCaches(tagId: String) async {
        await refreshAssetListCaches()
        if let lookup = try? await convex.lookupTag(tagId) {
            try? store.replaceTagLookup(lookup, tagId: tagId)
            if let assetId = lookup.asset?.id,
               let history = try? await convex.assetHistory(assetId: assetId) {
                try? store.replaceAssetHistory(history, assetId: assetId)
            }
        }
    }

    private func refreshCreatedAssetCaches(assetId: String, tagId: String?) async {
        await refreshAssetListCaches()
        if let history = try? await convex.assetHistory(assetId: assetId) {
            try? store.replaceAssetHistory(history, assetId: assetId)
        }
        if let tagId, let lookup = try? await convex.lookupTag(tagId) {
            try? store.replaceTagLookup(lookup, tagId: tagId)
        }
    }

    private func refreshAnnouncementsCache() async {
        if let rows = try? await convex.listAnnouncements() {
            try? store.replaceAnnouncements(rows)
        }
    }

    private func refreshTrainingCertificationCaches() async {
        if let rows = try? await convex.listTrainingCertifications() {
            try? store.replaceTrainingCertifications(rows)
        }
    }

    private func refreshTaskCaches() async {
        if let rows = try? await convex.listTasks() {
            try? store.replaceTasks(rows)
        }
    }

    private func refreshSoccerEvaluationCaches(memberId: String) async {
        if let grade = try? await convex.playerGrade(memberId: memberId) {
            try? store.replacePlayerGrade(grade, memberId: memberId)
        }
        if let rows = try? await convex.listPlayerRoster() {
            try? store.replacePlayerRoster(rows)
        }
    }

    private func refreshPlayerListingCache() async {
        if let rows = try? await convex.listPlayerRegistrations() {
            try? store.replacePlayerListings(rows)
        }
    }

    private func refreshMemberCaches() async {
        if let rows = try? await convex.listMembers() {
            try? store.replaceMembers(rows)
        }
        await refreshPlayerListingCache()
        if let rows = try? await convex.listPlayerRoster() {
            try? store.replacePlayerRoster(rows)
        }
    }

    private func refreshTeamCaches() async {
        if let rows = try? await convex.listTeams(includeInactive: true) {
            try? store.replaceTeams(rows)
        }
        await refreshPlayerListingCache()
    }

    private func refreshRegistrationCaches(memberId: String) async {
        await refreshPlayerListingCache()
        await refreshSoccerEvaluationCaches(memberId: memberId)
    }

    private func refreshFieldRegistrationCaches() async {
        await refreshMemberCaches()
        await refreshPlayerListingCache()
    }

    private func refreshSoccerSetupCaches() async {
        if let rows = try? await convex.listSoccerDivisions() {
            try? store.replaceSoccerDivisions(rows)
        }
        if let rows = try? await convex.listSoccerCompetitions() {
            try? store.replaceSoccerCompetitions(rows)
        }
        await refreshPlayerListingCache()
    }

    private func refreshSoccerSkillCaches() async {
        if let rows = try? await convex.listSoccerSkills(includeInactive: true) {
            try? store.replaceSoccerSkills(rows)
        }
        if let rows = try? await convex.listPlayerRoster() {
            try? store.replacePlayerRoster(rows)
        }
    }

    private func refreshAgeGroupCaches() async {
        if let rows = try? await convex.listTeamAgeGroups(includeInactive: true) {
            try? store.replaceTeamAgeGroups(rows)
        }
        await refreshPlayerListingCache()
    }

    private func refreshMatchDayCaches() async {
        if let rows = try? await convex.listMatchDaySquads(upcomingOnly: false) {
            try? store.replaceMatchDaySquads(rows)
        }
    }

    private func refreshLocationDefaultsCache() async {
        if let defaults = try? await convex.locationDefaults() {
            try? store.replaceLocationDefaults(defaults)
        }
    }
}

// MARK: - Payload DTOs

struct RsvpPayload: Codable {
    let eventId: String
    let memberId: String
    let status: RsvpStatus
}

struct EventMutationPayload: Codable {
    let type: String
    let title: String
    let description: String?
    let location: String?
    let startTime: Double
    let endTime: Double?
    let teamId: String?
    let opponent: String?
}

struct EventUpdatePayload: Codable {
    let eventId: String
    let event: EventMutationPayload
}

struct EventDeletePayload: Codable {
    let eventId: String
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

struct FleetInspectionPayload: Codable {
    let assetId: String
    let type: String // pre_start | periodic | return
    let result: String // pass | pass_with_defects | fail
    let odometer: Double?
    let engineHours: Double?
    let notes: String?
    let latitude: Double?
    let longitude: Double?
    let accuracy: Double?
}

struct FleetDefectPayload: Codable {
    let assetId: String
    let severity: String // minor | major | critical
    let title: String
    let description: String?
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

struct EvaluationDeletePayload: Codable {
    let memberId: String
    let skillId: String
}

struct AssignmentPayload: Codable {
    let memberId: String
    let teamId: String?
    let divisionId: String?
    let clearTeam: Bool
    let clearDivision: Bool
    let kitColour: String?
}

struct CreateAssetPayload: Codable {
    let name: String
    let category: String
    let description: String?
    let serialNumber: String?
    let condition: String?
    let location: String?
    let notes: String?
    let nfcTagId: String?

    init(
        name: String,
        category: String,
        description: String? = nil,
        serialNumber: String? = nil,
        condition: String? = nil,
        location: String? = nil,
        notes: String? = nil,
        nfcTagId: String? = nil
    ) {
        self.name = name
        self.category = category
        self.description = description
        self.serialNumber = serialNumber
        self.condition = condition
        self.location = location
        self.notes = notes
        self.nfcTagId = nfcTagId
    }
}

struct AssetMutationPayload: Codable {
    let name: String
    let category: String
    let description: String?
    let serialNumber: String?
    let condition: String
    let location: String?
    let notes: String?
}

struct AssetUpdatePayload: Codable {
    let assetId: String
    let asset: AssetMutationPayload
}

struct AssetLifecyclePayload: Codable {
    let assetId: String
    let notes: String?
}

struct AssetDeletePayload: Codable {
    let assetId: String
}

struct OrgDefaultAddressPayload: Codable {
    let defaultAddress: String?
}

struct AnnouncementMutationPayload: Codable {
    let title: String
    let body: String
    let teamId: String?
    let pinned: Bool
}

struct AnnouncementUpdatePayload: Codable {
    let announcementId: String
    let announcement: AnnouncementMutationPayload
}

struct AnnouncementDeletePayload: Codable {
    let announcementId: String
}

struct MemberMutationPayload: Codable {
    let firstName: String
    let lastName: String
    let email: String?
    let phone: String?
    let dateOfBirth: String?
    let status: MemberStatus
    let notes: String?
    let isVolunteer: Bool
    let clubRole: String?
}

struct MemberUpdatePayload: Codable {
    let memberId: String
    let member: MemberMutationPayload
}

struct MemberDeletePayload: Codable {
    let memberId: String
}

struct TeamMutationPayload: Codable {
    let name: String
    let ageGroup: String?
    let season: String?
    let description: String?
    let isActive: Bool
    let kitColour: String?
    let kitBagNumber: String?
    let competitionId: String?
    let divisionId: String?
    let coach: String?
    let coachEmail: String?
    let coachPhone: String?
    let additionalCoach: String?
    let additionalCoachEmail: String?
    let additionalCoachPhone: String?
    let manager: String?
    let managerEmail: String?
    let managerPhone: String?
    let teamRegistered: Bool?
    let teamRegisteredDate: String?
    let teamRegistrationPaid: Bool?
}

struct TeamUpdatePayload: Codable {
    let teamId: String
    let team: TeamMutationPayload
}

struct TeamDeletePayload: Codable {
    let teamId: String
}

struct RegistrationDetailsPayload: Codable {
    let competitionId: String?
    let ageGroupKey: String?
    let teamId: String?
    let divisionId: String?
    let clearTeam: Bool
    let clearDivision: Bool
    let ffaNumber: String?
    let gender: String?
    let schoolName: String?
    let registered: Bool
    let paid: Bool
    let paymentPlan: Bool
    let paymentPlanStart: String?
    let paymentPlanEnd: String?
    let comments: String?
    let kitColour: String?
}

struct RegistrationMutationPayload: Codable {
    let memberId: String
    let details: RegistrationDetailsPayload
}

struct RegistrationDeletePayload: Codable {
    let memberId: String
}

struct FieldRegistrationPayload: Codable {
    let firstName: String
    let lastName: String
    let email: String?
    let phone: String?
    let dateOfBirth: String?
    let notes: String?
    let guardianFirstName: String?
    let guardianLastName: String?
    let guardianEmail: String?
    let guardianPhone: String?
    let guardianRelationship: String?
    let emergencyName: String?
    let emergencyRelationship: String?
    let emergencyPhone: String?
    let emergencyEmail: String?
    let registration: RegistrationDetailsPayload
}

struct DivisionMutationPayload: Codable {
    let id: String?
    let name: String
    let minGrade: Double
    let maxGrade: Double
    let color: String?
    let active: Bool
}

struct CompetitionMutationPayload: Codable {
    let id: String?
    let name: String
    let season: String?
    let active: Bool
}

struct SkillMutationPayload: Codable {
    let name: String
    let description: String?
    let weight: Double
    let maxScore: Double
    let active: Bool
}

struct SkillUpdatePayload: Codable {
    let skillId: String
    let skill: SkillMutationPayload
}

struct AgeGroupMutationPayload: Codable {
    let label: String
}

struct AgeGroupUpdatePayload: Codable {
    let id: String
    let label: String
}

struct AgeGroupActivePayload: Codable {
    let id: String
    let active: Bool
}
