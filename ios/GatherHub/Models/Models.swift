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

// MARK: - Members

/// A club member (row from the `members` table). Used for custodian pickers and
/// RSVP. Many fields are admin-only; we keep the common ones.
struct Member: Codable, Identifiable, Hashable {
    let id: String
    let firstName: String
    let lastName: String
    let email: String?
    let phone: String?
    let status: MemberStatus
    let isVolunteer: Bool?

    var fullName: String { "\(firstName) \(lastName)" }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case firstName, lastName, email, phone, status, isVolunteer
    }
}

enum MemberStatus: String, Codable, Hashable {
    case active, inactive
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

/// Mirrors `assetCategoryValidator` in schema.ts.
enum AssetCategory: String, Codable, Hashable {
    case uniform
    case kitBag = "kit_bag"
    case ball
    case trainingEquipment = "training_equipment"
    case goal
    case gazebo
    case firstAid = "first_aid"
    case key
    case device
    case vehicle
    case other

    var displayName: String {
        switch self {
        case .kitBag: return "Kit bag"
        case .trainingEquipment: return "Training equipment"
        case .firstAid: return "First aid"
        default: return rawValue.capitalized
        }
    }
}

/// Mirrors `assetConditionValidator` in schema.ts.
enum AssetCondition: String, Codable, Hashable {
    case new, good, fair, poor, damaged
}

/// A KitTrace asset (row from the `assets` table), as returned in full by
/// `tags:lookupAuthed`. Unknown/admin-only fields are decoded best-effort.
struct Asset: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let category: AssetCategory
    let description: String?
    let serialNumber: String?
    let condition: AssetCondition
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

// MARK: - Events

/// Mirrors `eventTypeValidator` in schema.ts.
enum EventType: String, Codable, Hashable {
    case training, match, meeting

    var displayName: String { rawValue.capitalized }

    var systemImage: String {
        switch self {
        case .training: return "figure.run"
        case .match: return "sportscourt"
        case .meeting: return "person.3"
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
