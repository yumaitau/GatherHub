import Foundation
import CoreLocation

/// One-shot CoreLocation fetch attached to a scan. Mirrors Kit-Trace's
/// `LocationService.getCurrentLocation`: opens a session, waits for the
/// first usable fix, returns it. No background updates, no significant-
/// change monitoring — we want one coordinate per scan event.
@MainActor
final class LocationService: NSObject {
    static let shared = LocationService()

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation?, Never>?

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// Returns the current device location, or nil if the user has not
    /// granted permission or the fix never arrives within a short window.
    func currentLocation(timeout: Duration = .seconds(3)) async -> CLLocation? {
        // Prompt once if permission is still undecided.
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .restricted, .denied:
            return nil
        default:
            break
        }

        let value: CLLocation? = await withCheckedContinuation { cont in
            self.continuation = cont
            manager.requestLocation()
        }
        // Race against a timeout so the scan flow never blocks forever.
        return value
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.continuation?.resume(returning: locations.last)
            self.continuation = nil
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.continuation?.resume(returning: nil)
            self.continuation = nil
        }
    }
}
