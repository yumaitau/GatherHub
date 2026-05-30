import SwiftUI

/// Small status pill. Variants match the web's Badge component tones:
/// `accent`, `muted`, `success`, `warning`, `danger`, `info`, `outline`.
struct GHBadge: View {
    enum Variant {
        case accent, muted, success, warning, danger, info, outline
    }

    let text: String
    var variant: Variant = .muted

    var body: some View {
        Text(text)
            .font(.gh.caption.weight(.semibold))
            .padding(.horizontal, GHSpacing.md)
            .padding(.vertical, 2)
            .foregroundStyle(foreground)
            .background(background)
            .overlay(
                RoundedRectangle(cornerRadius: GHSpacing.chipRadius, style: .continuous)
                    .stroke(stroke, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius, style: .continuous))
    }

    private var foreground: Color {
        switch variant {
        case .accent: return Color.gh.accentInk
        case .muted: return Color.gh.inkSoft
        case .success: return Color.gh.success
        case .warning: return Color.gh.warning
        case .danger: return Color.gh.danger
        case .info: return Color.gh.info
        case .outline: return Color.gh.ink
        }
    }

    private var background: Color {
        switch variant {
        case .accent: return Color.gh.accent
        case .muted: return Color.gh.surfaceSunk
        case .success: return Color.gh.successWash
        case .warning: return Color.gh.warningWash
        case .danger: return Color.gh.dangerWash
        case .info: return Color.gh.infoWash
        case .outline: return .clear
        }
    }

    private var stroke: Color {
        switch variant {
        case .outline: return Color.gh.hairline
        default: return .clear
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: GHSpacing.md) {
        GHBadge(text: "Match", variant: .accent)
        GHBadge(text: "Training", variant: .muted)
        GHBadge(text: "Active", variant: .success)
        GHBadge(text: "Plan", variant: .warning)
        GHBadge(text: "Unpaid", variant: .danger)
        GHBadge(text: "Info", variant: .info)
        GHBadge(text: "Hidden", variant: .outline)
    }
    .padding(GHSpacing.pageInset)
    .background(Color.gh.paper)
}
