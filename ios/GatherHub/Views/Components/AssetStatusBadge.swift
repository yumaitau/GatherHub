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

    private var color: Color {
        switch status {
        case .available: return .green
        case .checkedOut, .inUse: return .orange
        case .maintenance: return .blue
        case .lost: return .red
        case .retired: return .gray
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
