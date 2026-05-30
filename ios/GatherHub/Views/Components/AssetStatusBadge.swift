import SwiftUI

/// A small coloured pill showing an asset's status.
struct AssetStatusBadge: View {
    let status: AssetStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
            .accessibilityLabel("Status: \(status.displayName)")
    }

    /// Pull from the project's design tokens so the badge stays legible
    /// in both light and dark mode (raw .red / .green / .orange render at
    /// poor contrast on dark backgrounds).
    private var color: Color {
        switch status {
        case .available: return Color.gh.success
        case .checkedOut, .inUse: return Color.gh.warning
        case .maintenance: return Color.gh.info
        case .lost: return Color.gh.danger
        case .retired: return Color.gh.inkQuiet
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 8) {
        AssetStatusBadge(status: .available)
        AssetStatusBadge(status: .checkedOut)
        AssetStatusBadge(status: .lost)
        AssetStatusBadge(status: .retired)
    }
    .padding()
}
