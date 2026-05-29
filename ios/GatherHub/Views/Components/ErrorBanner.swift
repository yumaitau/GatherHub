import SwiftUI

/// A dismissible inline error banner. Bind it to an optional error string;
/// it renders only while the binding is non-nil.
struct ErrorBanner: View {
    @Binding var message: String?

    var body: some View {
        if let message {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.white)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    self.message = nil
                } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(.white.opacity(0.9))
                }
                .accessibilityLabel("Dismiss error")
            }
            .padding(12)
            .background(Color.red, in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

#Preview {
    ErrorBanner(message: .constant("Something went wrong while checking in."))
}
