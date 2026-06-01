import Foundation

// MARK: - Training certifications

struct TrainingCertificationRow: Codable, Identifiable, Hashable {
    let cert: TrainingCertification
    let member: Member?

    var id: String { cert.id }
    var memberName: String { member?.fullName ?? "Unknown member" }
}

struct TrainingCertification: Codable, Identifiable, Hashable {
    let id: String
    let memberId: String
    let name: String
    let issuer: String?
    let issuedDate: String?
    let expiryDate: String?
    let notes: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case memberId, name, issuer, issuedDate, expiryDate, notes
    }
}

struct TrainingCertificationMutationPayload: Codable {
    let memberId: String
    let name: String
    let issuer: String?
    let issuedDate: String?
    let expiryDate: String?
    let notes: String?
}

struct TrainingCertificationUpdatePayload: Codable {
    let certId: String
    let certification: TrainingCertificationMutationPayload
}

struct TrainingCertificationDeletePayload: Codable {
    let certId: String
}

// MARK: - Tasks

enum TaskStatus: String, Codable, CaseIterable, Identifiable, Hashable {
    case todo
    case inProgress = "in_progress"
    case blocked
    case done

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .todo: return "To do"
        case .inProgress: return "In progress"
        case .blocked: return "Blocked"
        case .done: return "Done"
        }
    }

    var systemImage: String {
        switch self {
        case .todo: return "circle"
        case .inProgress: return "clock"
        case .blocked: return "exclamationmark.octagon"
        case .done: return "checkmark.circle"
        }
    }
}

struct TaskBoardTask: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let assigneeMemberId: String?
    let status: TaskStatus
    let dueDate: String?
    let order: Double
    let reminderEnabled: Bool
    let reminderEveryDays: Int
    let lastReminderQueuedAt: Double?
    let createdBy: String?
    let createdAt: Double?
    let updatedAt: Double?
    let completedAt: Double?
    let assignee: TaskAssignee?
    let reminderStats: TaskReminderStats?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title, description, assigneeMemberId, status, dueDate, order
        case reminderEnabled, reminderEveryDays, lastReminderQueuedAt
        case createdBy, createdAt, updatedAt, completedAt
        case assignee, reminderStats
    }
}

struct TaskAssignee: Codable, Identifiable, Hashable {
    let id: String
    let firstName: String
    let lastName: String
    let email: String?

    var fullName: String { "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case firstName, lastName, email
    }
}

struct TaskReminderStats: Codable, Hashable {
    let queued: Int
    let sent: Int
    let failed: Int
    let skipped: Int
}

struct TaskMutationPayload: Codable {
    let title: String
    let description: String?
    let assigneeMemberId: String?
    let status: TaskStatus
    let dueDate: String?
    let reminderEnabled: Bool
    let reminderEveryDays: Int
}

struct TaskUpdatePayload: Codable {
    let taskId: String
    let task: TaskMutationPayload
}

struct TaskMovePayload: Codable {
    let taskId: String
    let status: TaskStatus
}

struct TaskDeletePayload: Codable {
    let taskId: String
}

// MARK: - Sport fixtures

enum SportFixtureStatus: String, Codable, Hashable {
    case scheduled
    case postponed
    case cancelled
    case completed
    case forfeit

    var displayName: String {
        switch self {
        case .scheduled: return "Scheduled"
        case .postponed: return "Postponed"
        case .cancelled: return "Cancelled"
        case .completed: return "Completed"
        case .forfeit: return "Forfeit"
        }
    }
}

struct SportFixtureTeam: Codable, Identifiable, Hashable {
    let id: String
    let fixtureId: String
    let teamId: String?
    let side: String
    let displayName: String?
    let score: Double?
    let result: String?
    let order: Double
    let teamName: String?

    var label: String { teamName ?? displayName ?? "TBC" }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case fixtureId, teamId, side, displayName, score, result, order, teamName
    }
}

struct SportOfficialAssignment: Codable, Identifiable, Hashable {
    let id: String
    let fixtureId: String
    let memberId: String?
    let role: String
    let name: String?
    let notes: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case fixtureId, memberId, role, name, notes
    }
}

struct SportFixture: Codable, Identifiable, Hashable {
    let id: String
    let sportKey: String?
    let seasonId: String?
    let competitionId: String?
    let divisionId: String?
    let venueId: String?
    let title: String
    let roundNumber: Double?
    let roundName: String?
    let fieldName: String?
    let startTime: Double
    let endTime: Double?
    let status: SportFixtureStatus
    let resultJson: String?
    let notes: String?
    let seasonName: String?
    let competitionName: String?
    let divisionName: String?
    let venueName: String?
    let venueAddress: String?
    let teams: [SportFixtureTeam]
    let officials: [SportOfficialAssignment]

    var startDate: Date { Date(timeIntervalSince1970: startTime / 1000) }

    var teamSummary: String {
        let home = teams.first { $0.side == "home" }?.label
        let away = teams.first { $0.side == "away" }?.label
        return [home, away].compactMap { $0 }.joined(separator: " vs ")
    }

    var venueSummary: String? {
        [venueName, fieldName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " / ")
            .nilIfEmpty
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case sportKey, seasonId, competitionId, divisionId, venueId
        case title, roundNumber, roundName, fieldName, startTime, endTime
        case status, resultJson, notes
        case seasonName, competitionName, divisionName, venueName, venueAddress
        case teams, officials
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

enum ISODateString {
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func string(from date: Date) -> String {
        formatter.string(from: date)
    }

    static func date(from value: String?) -> Date? {
        guard let value else { return nil }
        return formatter.date(from: value)
    }
}

extension Member {
    var isTaskAssignable: Bool {
        let blockedRoles: Set<String> = ["parent", "player"]
        let clubRole = clubRole?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let accountRole = membershipRole?.rawValue.lowercased()
        return !blockedRoles.contains(clubRole ?? "") && !blockedRoles.contains(accountRole ?? "")
    }
}
