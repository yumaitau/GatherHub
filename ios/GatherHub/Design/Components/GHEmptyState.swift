import SwiftUI

/// Default empty-state surface. Centered icon + title + description, with
/// an optional inline action button. Mirrors `EmptyState` in
/// `web/src/components/shared.tsx` / `ui/empty-state.tsx`.
struct GHEmptyState<Action: View>: View {
    let title: String
    var description: String?
    var systemImage: String = "tray"
    @ViewBuilder var action: () -> Action

    init(
        title: String,
        description: String? = nil,
        systemImage: String = "tray",
        @ViewBuilder action: @escaping () -> Action = { EmptyView() }
    ) {
        self.title = title
        self.description = description
        self.systemImage = systemImage
        self.action = action
    }

    var body: some View {
        VStack(spacing: GHSpacing.lg) {
            Image(systemName: systemImage)
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(Color.gh.inkQuiet)
            Text(title)
                .font(.gh.title)
                .foregroundStyle(Color.gh.inkStrong)
                .multilineTextAlignment(.center)
            if let description {
                Text(description)
                    .font(.gh.body)
                    .foregroundStyle(Color.gh.inkSoft)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 360)
            }
            action()
        }
        .padding(.vertical, GHSpacing.huge)
        .padding(.horizontal, GHSpacing.xxl)
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    GHEmptyState(
        title: "No teams yet",
        description: "Create your first team to start organising members.",
        systemImage: "shield",
        action: { Button("Create team") {}.buttonStyle(.gh(.primary)) }
    )
    .padding(GHSpacing.pageInset)
    .background(Color.gh.paper)
}
