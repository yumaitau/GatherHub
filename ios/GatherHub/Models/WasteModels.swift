import Foundation

/// Models for the waste-removal vertical (GX-11). Mirror the subset of
/// `waste:listLoads` rows the driver flows consume. Field names match the
/// backend exactly; decode only what the UI uses (the row carries more).

// MARK: - Status

/// Lifecycle of a waste load. Mirrors the backend status validator:
/// scheduled | picked_up | in_transit | arrived | accepted | processed |
/// rejected | redirected | cancelled.
enum WasteLoadStatus: String, Codable, CaseIterable, Identifiable, Hashable {
    case scheduled
    case pickedUp = "picked_up"
    case inTransit = "in_transit"
    case arrived
    case accepted
    case processed
    case rejected
    case redirected
    case cancelled

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .scheduled: return "Scheduled"
        case .pickedUp: return "Picked up"
        case .inTransit: return "In transit"
        case .arrived: return "Arrived"
        case .accepted: return "Accepted"
        case .processed: return "Processed"
        case .rejected: return "Rejected"
        case .redirected: return "Redirected"
        case .cancelled: return "Cancelled"
        }
    }

    var systemImage: String {
        switch self {
        case .scheduled: return "calendar"
        case .pickedUp: return "shippingbox"
        case .inTransit: return "truck.box"
        case .arrived: return "mappin.and.ellipse"
        case .accepted: return "checkmark.seal"
        case .processed: return "checkmark.circle"
        case .rejected: return "xmark.octagon"
        case .redirected: return "arrow.uturn.right"
        case .cancelled: return "slash.circle"
        }
    }

    /// A scheduled load awaits its pickup leg.
    var awaitsPickup: Bool { self == .scheduled }

    /// A picked-up / in-transit load awaits its arrival leg.
    var awaitsArrival: Bool { self == .pickedUp || self == .inTransit }
}

// MARK: - Unit

/// Measurement unit for a load amount. Mirrors the backend unit validator:
/// kg | tonne | litre | cubic_metre | bin | skip | each.
enum WasteUnit: String, Codable, CaseIterable, Identifiable, Hashable {
    case kg
    case tonne
    case litre
    case cubicMetre = "cubic_metre"
    case bin
    case skip
    case each

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .kg: return "Kilograms (kg)"
        case .tonne: return "Tonnes"
        case .litre: return "Litres"
        case .cubicMetre: return "Cubic metres (m³)"
        case .bin: return "Bins"
        case .skip: return "Skips"
        case .each: return "Each"
        }
    }

    var shortLabel: String {
        switch self {
        case .kg: return "kg"
        case .tonne: return "t"
        case .litre: return "L"
        case .cubicMetre: return "m³"
        case .bin: return "bin"
        case .skip: return "skip"
        case .each: return "ea"
        }
    }
}

// MARK: - Load summary

/// Subset of a `waste:listLoads` row used by the driver flows. The backend
/// returns additional fields; we decode only what the UI consumes.
struct WasteLoadSummary: Codable, Identifiable, Hashable {
    let id: String
    let reference: String?
    let status: WasteLoadStatus
    let streamName: String?
    let consignor: String?
    let plannedReceiver: String?
    let container: String?
    let scheduledFor: Double?
    let pickupAmount: Double?
    let pickupUnit: WasteUnit?
    let arrivalAmount: Double?
    let arrivalUnit: WasteUnit?
    let hasDiscrepancy: Bool?
    let discrepancyFlags: [String]?

    var scheduledDate: Date? {
        guard let scheduledFor else { return nil }
        return Date(timeIntervalSince1970: scheduledFor / 1000)
    }

    var title: String {
        reference?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? streamName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? "Load"
    }

    var routeSummary: String? {
        let from = consignor?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let to = plannedReceiver?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        switch (from, to) {
        case let (from?, to?): return "\(from) → \(to)"
        case let (from?, nil): return from
        case let (nil, to?): return "→ \(to)"
        default: return nil
        }
    }

    var flaggedDiscrepancy: Bool { hasDiscrepancy == true }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case reference, status, streamName, consignor, plannedReceiver
        case container, scheduledFor, pickupAmount, pickupUnit
        case arrivalAmount, arrivalUnit, hasDiscrepancy, discrepancyFlags
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
