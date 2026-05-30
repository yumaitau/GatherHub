import SwiftUI

/// Button styles mirroring the web shadcn variants used in GatherHub:
/// `primary` (filled accent), `secondary` (filled surface-sunk), `outline`
/// (hairline border), and `ghost` (transparent, ink-on-hover).
struct GHButtonStyle: ButtonStyle {
    enum Variant { case primary, secondary, outline, ghost }
    enum Size { case sm, md }

    let variant: Variant
    var size: Size = .md

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(font)
            .foregroundStyle(foreground)
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .background(background(pressed: configuration.isPressed))
            .overlay(
                RoundedRectangle(cornerRadius: GHSpacing.chipRadius, style: .continuous)
                    .stroke(border, lineWidth: variant == .outline ? 1 : 0)
            )
            .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
            .animation(GHMotion.quick, value: configuration.isPressed)
    }

    private var font: Font {
        switch size {
        case .sm: return .gh.caption.weight(.semibold)
        case .md: return .gh.body.weight(.semibold)
        }
    }
    private var hPad: CGFloat { size == .sm ? 10 : 14 }
    private var vPad: CGFloat { size == .sm ? 6 : 9 }

    private var foreground: Color {
        switch variant {
        case .primary: return Color.gh.accentInk
        case .secondary: return Color.gh.inkStrong
        case .outline, .ghost: return Color.gh.inkStrong
        }
    }

    private func background(pressed: Bool) -> Color {
        switch variant {
        case .primary: return pressed ? Color.gh.accentActive : Color.gh.accent
        case .secondary: return pressed ? Color.gh.border : Color.gh.surfaceSunk
        case .outline: return pressed ? Color.gh.surfaceSunk : .clear
        case .ghost: return pressed ? Color.gh.surfaceSunk : .clear
        }
    }

    private var border: Color {
        variant == .outline ? Color.gh.hairline : .clear
    }
}

extension ButtonStyle where Self == GHButtonStyle {
    /// `Button("Save") {}.buttonStyle(.gh(.primary))`
    static func gh(_ variant: GHButtonStyle.Variant, size: GHButtonStyle.Size = .md) -> GHButtonStyle {
        GHButtonStyle(variant: variant, size: size)
    }
}

#Preview {
    VStack(spacing: GHSpacing.md) {
        Button("Primary") {}.buttonStyle(.gh(.primary))
        Button("Secondary") {}.buttonStyle(.gh(.secondary))
        Button("Outline") {}.buttonStyle(.gh(.outline))
        Button("Ghost") {}.buttonStyle(.gh(.ghost))
    }
    .padding(GHSpacing.pageInset)
    .background(Color.gh.paper)
}
