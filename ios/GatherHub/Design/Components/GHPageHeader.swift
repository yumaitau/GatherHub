import SwiftUI

/// Reusable page header with title, optional description, and trailing
/// actions slot. Mirrors `PageHeader` in `web/src/components/shared.tsx`.
struct GHPageHeader<Actions: View>: View {
    let title: String
    var description: String?
    @ViewBuilder var actions: () -> Actions

    init(
        title: String,
        description: String? = nil,
        @ViewBuilder actions: @escaping () -> Actions = { EmptyView() }
    ) {
        self.title = title
        self.description = description
        self.actions = actions
    }

    var body: some View {
        HStack(alignment: .top, spacing: GHSpacing.xl) {
            VStack(alignment: .leading, spacing: GHSpacing.xs) {
                Text(title)
                    .font(.gh.headline)
                    .foregroundStyle(Color.gh.inkStrong)
                if let description {
                    Text(description)
                        .font(.gh.body)
                        .foregroundStyle(Color.gh.inkSoft)
                }
            }
            Spacer(minLength: GHSpacing.md)
            actions()
        }
        .padding(.bottom, GHSpacing.xl)
    }
}

#Preview {
    GHPageHeader(
        title: "Members",
        description: "Everyone with a record at this club.",
        actions: {
            Button("New member") {}.buttonStyle(.gh(.primary))
        }
    )
    .padding(GHSpacing.pageInset)
    .background(Color.gh.paper)
}
