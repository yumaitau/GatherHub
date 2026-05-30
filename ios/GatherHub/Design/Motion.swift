import SwiftUI

/// Animation durations and curves matching the web tokens (`--duration-fast`,
/// `--duration-base`, `--duration-slow` and the exponential ease-out
/// signature). No bounce or elastic — the brand's quiet operator stance
/// disallows them, see PRODUCT.md.
enum GHMotion {
    static let fast: Double = 0.12
    static let base: Double = 0.20
    static let slow: Double = 0.32

    /// Default ease for state transitions. `easeOut` here is the SwiftUI
    /// equivalent of the web `cubic-bezier(0.22, 1, 0.36, 1)` ease-out-quart.
    static var standard: Animation { .easeOut(duration: base) }
    static var quick: Animation { .easeOut(duration: fast) }
    static var gentle: Animation { .easeOut(duration: slow) }
}
