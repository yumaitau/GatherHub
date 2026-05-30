import CoreGraphics

/// 4-pt-grid spacing scale, mirroring the web app's Tailwind step list
/// (0.5/1/1.5/2/2.5/3/4/5/6/8/12 → 2/4/6/8/10/12/16/20/24/32/48 px). Names
/// match the closest semantic step on the web rather than the exact rem.
enum GHSpacing {
    static let xxs: CGFloat = 2
    static let xs: CGFloat = 4
    static let sm: CGFloat = 6
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
    static let xxl: CGFloat = 20
    static let xxxl: CGFloat = 24
    static let huge: CGFloat = 32

    /// Standard page-edge inset for full-width screens.
    static let pageInset: CGFloat = 20

    /// Default corner radius for cards and sheets.
    static let cardRadius: CGFloat = 12

    /// Tighter radius for chips and small inputs.
    static let chipRadius: CGFloat = 6
}
