import Foundation
import Network
import Observation

/// System-level connectivity probe. Wraps `NWPathMonitor` and surfaces
/// `isOnline` as an `@Observable` so views and the sync coordinator
/// re-render the moment the path flips.
@MainActor
@Observable
final class NetworkMonitor {
    private(set) var isOnline: Bool = true
    /// `true` when the path is cellular vs Wi-Fi/Ethernet — useful for
    /// deferring heavy syncs until on Wi-Fi.
    private(set) var isExpensive: Bool = false

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "au.gatherhub.network-monitor")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.isOnline = path.status == .satisfied
                self.isExpensive = path.isExpensive
            }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }
}
