import SwiftUI

/// A dismissible inline error banner. Bind it to an optional error string;
/// it renders only while the binding is non-nil.
struct ErrorBanner: View {
    @Binding var message: String?

    var body: some View {
        if let message = UserFacingError.message(message) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.gh.danger)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Color.gh.inkStrong)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    self.message = nil
                } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(Color.gh.inkSoft)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss error")
            }
            .padding(12)
            .background(
                Color.gh.dangerWash,
                in: RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous)
                    .stroke(Color.gh.danger.opacity(0.25), lineWidth: 1)
            )
            .padding(.horizontal)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityElement(children: .combine)
        }
    }
}

#Preview {
    ErrorBanner(message: .constant("Something went wrong while checking in."))
}
