import SwiftUI

/// GatherHub type scale, mapped from the web app's CSS-in-Tailwind type
/// utilities (display / headline / title / body-strong / body / caption /
/// label) to SF Pro via SwiftUI's `Font.system`. SF Pro is preferred over
/// bundling Inter Variable: it ships with iOS, supports Dynamic Type out
/// of the box, and gives users their system-wide reading preferences for
/// free. The on-device feel is recognisably the same neutral grotesque.
///
/// Use as `Text("…").font(.gh.body)`.
extension Font {
    enum gh {
        /// 2.0rem on web. Hero titles only — never duplicate per screen.
        static let display = Font.system(size: 32, weight: .bold, design: .default)
            .leading(.tight)

        /// 1.5rem on web. Section heads.
        static let headline = Font.system(size: 22, weight: .semibold, design: .default)
            .leading(.tight)

        /// 1.125rem on web. Card titles, table headers.
        static let title = Font.system(size: 18, weight: .semibold, design: .default)

        /// 0.9375rem semi-bold. Lead-in body, list-item names.
        static let bodyStrong = Font.system(size: 15, weight: .semibold, design: .default)

        /// 0.9375rem. Default reading text.
        static let body = Font.system(size: 15, weight: .regular, design: .default)

        /// 0.8125rem. Secondary metadata, helper text.
        static let caption = Font.system(size: 13, weight: .regular, design: .default)

        /// 0.6875rem semi-bold uppercase. Eyebrow labels.
        static let label = Font.system(size: 11, weight: .semibold, design: .default)
            .smallCaps()

        /// Tabular monospace numerics. Use for IDs, codes, timestamps.
        static let mono = Font.system(size: 13, weight: .regular, design: .monospaced)
    }
}

/// Convenience modifier for the upper-cased "label" eyebrow style so callers
/// don't have to combine `.font` + `.tracking` + `.textCase` every time.
struct GHLabelStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.gh.label)
            .tracking(0.04)
            .textCase(.uppercase)
            .foregroundStyle(Color.gh.inkQuiet)
    }
}

extension View {
    /// Apply the "label" eyebrow style (small, uppercase, quiet ink).
    func ghLabelStyle() -> some View { modifier(GHLabelStyle()) }
}
