import Foundation
import Observation

/// View-model behind `DashboardView`. Owns the two Convex queries
/// (`dashboard:stats` + `soccer:dashboardStats`) and the load lifecycle.
/// Marked `@Observable` (iOS 17) so the view can use `@Bindable` /
/// implicit observation without an `ObservableObject` boilerplate.
@MainActor
@Observable
final class DashboardViewModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: LoadState = .idle
    private(set) var stats: DashboardStats?
    private(set) var soccer: SoccerDashboardStats?

    private let convex: ConvexService

    init(convex: ConvexService) {
        self.convex = convex
    }

    /// Greeting respects local time-of-day. Pure function so previews and
    /// tests can compose easily.
    static func greeting(at date: Date = .now,
                         calendar: Calendar = .current) -> String {
        let hour = calendar.component(.hour, from: date)
        switch hour {
        case 0..<12: return "Good morning"
        case 12..<18: return "Good afternoon"
        default: return "Good evening"
        }
    }

    func load() async {
        state = .loading
        do {
            async let primary = convex.dashboardStats()
            async let secondary = try? convex.soccerDashboardStats()
            self.stats = try await primary
            self.soccer = await secondary ?? nil
            self.state = .loaded
        } catch {
            self.state = .failed(error.localizedDescription)
        }
    }
}
