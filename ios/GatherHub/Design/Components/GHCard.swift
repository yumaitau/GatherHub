import SwiftUI

/// The default container surface for grouped content. Hairline border,
/// rounded corner radius, surface fill. Flat by default — no shadow.
///
/// Use as:
/// ```swift
/// GHCard { Text("Hello") }
/// ```
struct GHCard<Content: View>: View {
    var padding: CGFloat = GHSpacing.xl
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.gh.surface)
            .clipShape(RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous)
                    .stroke(Color.gh.hairline, lineWidth: 1)
            )
    }
}

#Preview {
    GHCard {
        VStack(alignment: .leading, spacing: GHSpacing.md) {
            Text("Today's roster").font(.gh.title).foregroundStyle(Color.gh.inkStrong)
            Text("12 going · 3 maybe · 2 no").font(.gh.body).foregroundStyle(Color.gh.inkSoft)
        }
    }
    .padding(GHSpacing.pageInset)
    .background(Color.gh.paper)
}
