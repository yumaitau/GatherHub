import SwiftUI

/// A simple empty / unavailable state.
///
/// `ContentUnavailableView` is iOS 17+, but the app targets iOS 16, so we use
/// this lightweight equivalent throughout. It mirrors the common
/// title / icon / message / action shape.
struct EmptyStateView: View {
    let title: String
    var systemImage: String = "tray"
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    EmptyStateView(
        title: "No upcoming events",
        systemImage: "calendar",
        message: "New training, matches and meetings will appear here.",
        actionTitle: "Refresh",
        action: {}
    )
}
