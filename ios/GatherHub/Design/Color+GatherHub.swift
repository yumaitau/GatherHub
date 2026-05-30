import SwiftUI
import UIKit

/// GatherHub design tokens, translated from the web app's OKLCH palette in
/// `web/src/index.css` to sRGB approximations suitable for SwiftUI / UIKit.
/// Every token resolves to its own value in light and dark mode via
/// `UIColor(dynamicProvider:)` so views can use a single `Color.gh.<name>`
/// reference and the theme follows the system appearance.
///
/// The numeric triples below are perceptual approximations of the OKLCH
/// values, not strict round-trips through a colour-management pipeline.
/// They are close enough that the iOS app reads as the same system as the
/// web at a glance. The brand source of truth is the web token; tweak here
/// only if the on-device result drifts visibly.
extension Color {
    /// Namespace for GatherHub design tokens. Use as `Color.gh.paper`,
    /// `Color.gh.inkStrong`, etc.
    enum gh {
        // MARK: Surfaces
        static let paper = adaptive(light: 0xFCFCFD, dark: 0x1B1D22)
        static let surface = adaptive(light: 0xF9F9FB, dark: 0x22252B)
        static let surfaceSunk = adaptive(light: 0xF2F2F6, dark: 0x16181D)
        static let surfaceRaised = adaptive(light: 0xFCFCFE, dark: 0x272A31)

        // MARK: Ink
        static let inkStrong = adaptive(light: 0x1A1D29, dark: 0xEBEDF1)
        static let ink = adaptive(light: 0x2C2F3D, dark: 0xCDD1DC)
        static let inkSoft = adaptive(light: 0x4D5160, dark: 0xA5AABA)
        static let inkQuiet = adaptive(light: 0x6B6F7C, dark: 0x82869A)

        // MARK: Borders
        static let hairline = adaptive(light: 0xE5E6EB, dark: 0x292D38)
        static let border = adaptive(light: 0xD6D8DE, dark: 0x353946)
        static let borderStrong = adaptive(light: 0xC0C2CA, dark: 0x444958)

        // MARK: Accent (slate-blue)
        static let accent = adaptive(light: 0x2A3D6E, dark: 0x7DA1D9)
        static let accentHover = adaptive(light: 0x1F3261, dark: 0x94B5E5)
        static let accentActive = adaptive(light: 0x162854, dark: 0xA6C2EC)
        static let accentWash = adaptive(light: 0xE8ECF5, dark: 0x1F2A3F)
        static let accentInk = adaptive(light: 0xFAFBFC, dark: 0x1A1D29)

        // MARK: Status
        static let success = adaptive(light: 0x207D3E, dark: 0x5DBC81)
        static let successWash = adaptive(light: 0xDDEFE2, dark: 0x1D3829)
        static let warning = adaptive(light: 0xA56F1F, dark: 0xEBAB44)
        static let warningWash = adaptive(light: 0xF0E8C9, dark: 0x403016)
        static let danger = adaptive(light: 0xA93432, dark: 0xE37160)
        static let dangerWash = adaptive(light: 0xF0DCD8, dark: 0x3F2521)
        static let info = adaptive(light: 0x28567A, dark: 0x6CA1C9)
        static let infoWash = adaptive(light: 0xDDE8F0, dark: 0x1C2D3F)

        // MARK: Focus
        static let focusRing = accent.opacity(0.6)
    }
}

private extension Color {
    /// Build a colour that resolves to `light` in light mode and `dark` in
    /// dark mode. Inputs are 0xRRGGBB integers in sRGB.
    static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(rgb: dark)
                : UIColor(rgb: light)
        })
    }
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        let r = CGFloat((rgb >> 16) & 0xFF) / 255.0
        let g = CGFloat((rgb >> 8) & 0xFF) / 255.0
        let b = CGFloat(rgb & 0xFF) / 255.0
        self.init(red: r, green: g, blue: b, alpha: 1.0)
    }
}
