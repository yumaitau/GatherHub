import Foundation

/// Mirrors the return shape of `dashboard:stats` (`web/convex/dashboard.ts`).
/// Counts apply to the caller's active organisation.
struct DashboardStats: Codable, Hashable, Equatable {
    let memberCount: Int
    let totalMemberCount: Int
    let teamCount: Int
    let upcomingEventCount: Int
    let assetCount: Int
    let checkedOutCount: Int
    let lostCount: Int
    let maintenanceCount: Int
    let overdueCount: Int
    let volunteerCount: Int
    let expiringCertCount: Int
    let sponsorCount: Int
    let sponsorValue: Double
}

/// Mirrors `soccer:dashboardStats`. Returned as `nil` when soccer mode is
/// off; iOS callers should hide the soccer section in that case.
struct SoccerDashboardStats: Codable, Hashable, Equatable {
    let playerCount: Int
    let registered: Int
    let paid: Int
    let unpaid: Int
    let onPaymentPlan: Int
    let expiredPaymentPlans: Int
    let coachCount: Int
    let managerCount: Int
    let wwvpApproved: Int
    let wwvpSighted: Int
    let wwvpPending: Int
    let wwvpNotProvided: Int
    let outstandingWwvp: Int
    let evaluatedAny: Int
    let evaluatedFully: Int
    let activeSkillCount: Int
}
