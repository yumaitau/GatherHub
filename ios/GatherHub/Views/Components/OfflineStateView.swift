import SwiftUI

/// A friendly full-screen state for offline / load-failure situations, with a
/// retry affordance. Field ops often happen on poor connectivity (sidelines,
/// equipment sheds), so failures should be calm and recoverable.
struct OfflineStateView: View {
    var title: String = "Can't reach GatherHub"
    var message: String = "You appear to be offline. Check your connection and try again."
    var systemImage: String = "wifi.slash"
    var retry: (() async -> Void)?

    var body: some View {
        EmptyStateView(
            title: title,
            systemImage: systemImage,
            message: message,
            actionTitle: retry == nil ? nil : "Try again",
            action: retry == nil ? nil : { Task { await retry?() } }
        )
    }
}

#Preview {
    OfflineStateView(retry: {})
}
