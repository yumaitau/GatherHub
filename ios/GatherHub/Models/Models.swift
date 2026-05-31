import Foundation

/// Codable models mirroring the Convex backend documents.
///
/// These match the shapes returned by the Convex functions in `web/convex/*`.
/// Convex documents carry a string `_id` and a numeric `_creationTime` (epoch
/// ms). Optional fields use Swift optionals so missing keys decode cleanly.
///
/// snake_case enum raw values match the backend validators in
/// `web/convex/schema.ts` exactly — do not "Swiftify" them.

// MARK: - Identity / context

/// A Clerk-mirrored user (subset returned by `sync:currentContext`).
struct AppUser: Codable, Identifiable, Hashable {
    /// Convex `_id` of the user document. `currentContext` returns this as `id`.
    let id: String
    let firstName: String?
    let lastName: String?
    let email: String?
    let imageUrl: String?

    var displayName: String {
        let name = [firstName, lastName].compactMap { $0 }.joined(separator: " ")
        return name.isEmpty ? (email ?? "Unknown user") : name
    }
}

/// An organisation == a club (subset returned by `sync:currentContext`).
struct Org: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String?
    let soccerMode: Bool?
    let defaultAddress: String?
}

/// GatherHub role. Mirrors `roleValidator` in schema.ts.
enum Role: String, Codable, Hashable {
    case owner, admin, committee, coach, volunteer, parent, player

    /// Roles permitted to perform asset check-out/check-in.
    /// Mirrors `ASSET_MANAGER_ROLES` on the backend (owner/admin/committee/coach).
    var canManageAssets: Bool {
        switch self {
        case .owner, .admin, .committee, .coach: return true
        case .volunteer, .parent, .player: return false
        }
    }

    var canManageOrgSettings: Bool {
        switch self {
        case .owner, .admin: return true
        case .committee, .coach, .volunteer, .parent, .player: return false
        }
    }

    var canManageMembers: Bool {
        switch self {
        case .owner, .admin, .committee, .coach: return true
        case .volunteer, .parent, .player: return false
        }
    }

    var canManageTeams: Bool {
        switch self {
        case .owner, .admin, .committee: return true
        case .coach, .volunteer, .parent, .player: return false
        }
    }

    var canManageSoccerSetup: Bool {
        switch self {
        case .owner, .admin, .committee: return true
        case .coach, .volunteer, .parent, .player: return false
        }
    }

    var canManageEvents: Bool {
        switch self {
        case .owner, .admin, .committee, .coach: return true
        case .volunteer, .parent, .player: return false
        }
    }

    var canCreateOrgAnnouncements: Bool {
        switch self {
        case .owner, .admin, .committee: return true
        case .coach, .volunteer, .parent, .player: return false
        }
    }

    var canDeleteAdministrativeRecords: Bool {
        switch self {
        case .owner, .admin: return true
        case .committee, .coach, .volunteer, .parent, .player: return false
        }
    }

    var displayName: String {
        rawValue.prefix(1).uppercased() + rawValue.dropFirst()
    }
}

/// Returned by `sync:currentContext`. Backend returns `null` when signed out /
/// no active org / not yet synced, so callers should treat this as optional.
struct CurrentContext: Codable, Hashable {
    let user: AppUser
    let org: Org
    let role: Role
}

struct LocationDefaults: Codable, Hashable {
    let defaultAddress: String?
}

struct TaxonomyOption: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let key: String
    let label: String
    let isDefault: Bool
    let order: Double?
    let active: Bool?
    let color: String?
}

// MARK: - Members

/// A club member (row from the `members` table). Used for custodian pickers and
/// RSVP. Many fields are admin-only; we keep the common ones.
struct Member: Codable, Identifiable, Hashable {
    let id: String
    let firstName: String
    let lastName: String
    let email: String?
    let phone: String?
    let dateOfBirth: String?
    let status: MemberStatus
    let notes: String?
    let isVolunteer: Bool?
    let clubRole: String?

    var fullName: String { "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case firstName, lastName, email, phone, dateOfBirth, status, notes, isVolunteer, clubRole
    }
}

enum MemberStatus: String, Codable, Hashable, CaseIterable, Identifiable {
    case active, inactive

    var id: String { rawValue }
}

/// Slim asset row used by pickers (e.g. "register tag against which asset?").
struct AssetSummary: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let category: String?
    let status: AssetStatus?
    let custodianName: String?
    let location: String?
    let dueBack: Double?
    let qrTagId: String?
    let nfcTagId: String?
    let serialNumber: String?

    var dueBackDate: Date? {
        dueBack.map { Date(timeIntervalSince1970: $0 / 1000) }
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, category, status, custodianName, location, dueBack, qrTagId, nfcTagId, serialNumber
    }
}

/// One row returned by `sync:myMemberships` — every club the signed-in
/// user belongs to, with role and whether it's currently the active org.
struct OrgMembership: Codable, Identifiable, Hashable {
    let membershipId: String
    let role: Role
    let isActive: Bool
    let org: Org?

    var id: String { membershipId }
}

// MARK: - Teams

/// Row returned by `teams:list` (team doc plus derived player/staff counts).
struct Team: Codable, Identifiable, Hashable {
    let id: String
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
    let playerCount: Int
    let staffCount: Int

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, ageGroup, season, description, isActive, kitColour, kitBagNumber
        case competitionId, divisionId
        case coach, coachEmail, coachPhone
        case additionalCoach, additionalCoachEmail, additionalCoachPhone
        case manager, managerEmail, managerPhone
        case teamRegistered, teamRegisteredDate, teamRegistrationPaid
        case playerCount, staffCount
    }
}

// MARK: - Announcements

/// Row returned by `announcements:list`.
struct Announcement: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let body: String
    let pinned: Bool
    let teamId: String?
    let teamName: String?
    let authorName: String?
    let isRead: Bool
    /// Epoch ms — Convex `_creationTime`.
    let creationTime: Double

    var creationDate: Date { Date(timeIntervalSince1970: creationTime / 1000) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title, body, pinned, teamId, teamName, authorName, isRead
        case creationTime = "_creationTime"
    }
}

// MARK: - Soccer rows

/// Row returned by `soccer:playerListing`.
struct PlayerListingRow: Codable, Identifiable, Hashable {
    let memberId: String
    let name: String
    let email: String?
    let dateOfBirth: String?
    let hasRegistration: Bool
    let registered: Bool
    let registeredAt: Double?
    let paid: Bool
    let paidAt: Double?
    let paymentPlan: Bool
    let paymentPlanStart: String?
    let paymentPlanEnd: String?
    let ffaNumber: String?
    let gender: String?
    let schoolName: String?
    let comments: String?
    let competitionId: String?
    let ageGroupKey: String?
    let teamId: String?
    let teamName: String?
    let divisionId: String?
    let divisionName: String?
    let divisionColor: String?
    let kitColour: String?
    let grade: Double?

    var id: String { memberId }
}

/// Row returned by `soccer:listCompetitions`.
struct SoccerCompetition: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let season: String?
    let active: Bool

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, season, active
    }
}

/// Row returned by `soccer:listDivisions`.
struct SoccerDivision: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let minGrade: Double
    let maxGrade: Double
    let color: String?
    let active: Bool

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, minGrade, maxGrade, color, active
    }
}

/// Row returned by `soccer:coachesAndManagers`.
struct CoachManagerRow: Codable, Identifiable, Hashable {
    let memberId: String
    let firstName: String
    let lastName: String
    let email: String?
    let phone: String?
    let clubRole: String
    let wwvpStatus: String
    let wwvpSightedAt: String?
    let wwvpExpiresAt: String?
    let registered: Bool?
    let registeredDate: String?

    var id: String { memberId }
    var fullName: String { "\(firstName) \(lastName)" }
}

/// Row returned by `soccer:playerRoster`.
struct PlayerRosterRow: Codable, Identifiable, Hashable {
    let memberId: String
    let name: String
    let email: String?
    let dateOfBirth: String?
    let scoredCount: Int
    let totalSkills: Int
    let grade: Double
    let division: PlayerRosterDivision?

    var id: String { memberId }
}

struct PlayerRosterDivision: Codable, Hashable {
    let id: String
    let name: String
    let color: String?
}

// MARK: - Grading

/// Row in the configurable skill rubric (`soccer:listSkills`).
struct SoccerSkill: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let weight: Double
    let maxScore: Double
    let order: Double
    let active: Bool

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, description, weight, maxScore, order, active
    }
}

/// A scored evaluation row (`soccer:playerEvaluations`).
struct SoccerEvaluation: Codable, Identifiable, Hashable {
    let id: String
    let memberId: String
    let skillId: String
    let score: Double
    let notes: String?
    let evaluatedAt: Double?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case memberId, skillId, score, notes, evaluatedAt
    }
}

/// Computed grade summary for one player (`soccer:playerGrade`).
struct PlayerGrade: Codable, Hashable {
    let grade: Double
    let division: PlayerRosterDivision?
    let scoredCount: Int
    let totalSkills: Int
    let evaluations: [SoccerEvaluation]
}

// MARK: - Assets

/// Mirrors `assetStatusValidator` in schema.ts.
enum AssetStatus: String, Codable, Hashable {
    case available
    case checkedOut = "checked_out"
    case inUse = "in_use"
    case maintenance
    case lost
    case retired

    var displayName: String {
        switch self {
        case .available: return "Available"
        case .checkedOut: return "Checked out"
        case .inUse: return "In use"
        case .maintenance: return "Maintenance"
        case .lost: return "Lost"
        case .retired: return "Retired"
        }
    }
}

/// A KitTrace asset (row from the `assets` table), as returned in full by
/// `tags:lookupAuthed`. Unknown/admin-only fields are decoded best-effort.
struct Asset: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    /// Asset categories are org-configurable taxonomy keys, so decode them as
    /// plain strings rather than a fixed enum.
    let category: String
    let description: String?
    let serialNumber: String?
    /// Asset conditions are org-configurable taxonomy keys.
    let condition: String
    let status: AssetStatus
    let custodianMemberId: String?
    let location: String?
    let notes: String?
    let qrTagId: String?
    let nfcTagId: String?
    /// Epoch ms; set when checked out with a return date.
    let dueBack: Double?

    var dueBackDate: Date? {
        dueBack.map { Date(timeIntervalSince1970: $0 / 1000) }
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, category, description, serialNumber, condition, status
        case custodianMemberId, location, notes, qrTagId, nfcTagId, dueBack
    }
}

extension String {
    var taxonomyDisplayName: String {
        split(separator: "_")
            .map { word in
                word.prefix(1).uppercased() + String(word.dropFirst())
            }
            .joined(separator: " ")
    }
}

// MARK: - Tags

/// An `assetTags` row (returned inside `tags:lookupAuthed`).
struct AssetTag: Codable, Hashable {
    let tagId: String
    let assetId: String
    let type: TagType
    let active: Bool
}

enum TagType: String, Codable, Hashable {
    case qr, nfc
}

/// Result of `tags:lookupAuthed`. The backend returns either
/// `{ found: false }` or `{ found: true, asset, custodian, tag }`, so all
/// payload fields are optional and gated by `found`.
struct TagLookupResult: Codable, Hashable {
    let found: Bool
    let asset: Asset?
    let custodian: Member?
    let tag: AssetTag?
}

struct AssetHistoryEntry: Codable, Identifiable, Hashable {
    let id: String
    let action: String
    let performedAt: Double
    let performerName: String
    let fromStatus: String?
    let toStatus: String?
    let fromCustodianName: String?
    let toCustodianName: String?
    let fromLocation: String?
    let toLocation: String?
    let notes: String?

    var performedDate: Date {
        Date(timeIntervalSince1970: performedAt / 1000)
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case action, performedAt, performerName, fromStatus, toStatus
        case fromCustodianName, toCustodianName, fromLocation, toLocation, notes
    }
}

// MARK: - Events

/// Mirrors `eventTypeValidator` in schema.ts while tolerating org-specific
/// taxonomy values that the native app did not know at compile time.
enum EventType: Codable, Hashable {
    case training
    case match
    case meeting
    case social
    case workingBee
    case custom(String)

    static let editableDefaults: [EventType] = [
        .training,
        .match,
        .meeting,
        .social,
        .workingBee,
    ]

    var rawValue: String {
        switch self {
        case .training: return "training"
        case .match: return "match"
        case .meeting: return "meeting"
        case .social: return "social"
        case .workingBee: return "working_bee"
        case .custom(let value): return value
        }
    }

    init(rawValue: String) {
        switch rawValue {
        case "training": self = .training
        case "match": self = .match
        case "meeting": self = .meeting
        case "social": self = .social
        case "working_bee": self = .workingBee
        default: self = .custom(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var displayName: String { rawValue.taxonomyDisplayName }

    var systemImage: String {
        switch self {
        case .training: return "figure.run"
        case .match: return "sportscourt"
        case .meeting: return "person.3"
        case .social: return "balloon"
        case .workingBee: return "hammer"
        case .custom: return "calendar"
        }
    }
}

/// Mirrors `rsvpStatusValidator` in schema.ts.
enum RsvpStatus: String, Codable, Hashable, CaseIterable {
    case going
    case notGoing = "not_going"
    case maybe

    var displayName: String {
        switch self {
        case .going: return "Going"
        case .notGoing: return "Not going"
        case .maybe: return "Maybe"
        }
    }
}

/// An event as returned by `events:list` (event fields plus the derived
/// `teamName` and `goingCount`).
struct Event: Codable, Identifiable, Hashable {
    let id: String
    let type: EventType
    let title: String
    let description: String?
    let location: String?
    /// Epoch ms.
    let startTime: Double
    /// Epoch ms.
    let endTime: Double?
    let teamId: String?
    let opponent: String?
    let teamName: String?
    let goingCount: Int?

    var startDate: Date { Date(timeIntervalSince1970: startTime / 1000) }
    var endDate: Date? { endTime.map { Date(timeIntervalSince1970: $0 / 1000) } }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case type, title, description, location, startTime, endTime
        case teamId, opponent, teamName, goingCount
    }
}
