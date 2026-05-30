import Foundation
import CoreNFC

/// Reads the raw hardware UID of an ISO 14443 / 15693 / FeliCa NFC tag using
/// `NFCTagReaderSession`. Mirrors Kit-Trace's `flutter_nfc_kit` behaviour:
/// any tag (not just an NDEF-provisioned one) emits its UID immediately.
///
/// Use alongside the existing `NFCScanner` (which reads NDEF URI payloads).
/// The two complement each other: a tag that has a club URL written on it
/// can be read by either; an unprovisioned tag only emits a UID.
@MainActor
final class NFCRawReader: NSObject, ObservableObject {
    @Published var lastUid: String?
    @Published var isScanning = false
    @Published var lastError: String?

    private var session: NFCTagReaderSession?

    func beginScanning() {
        guard NFCTagReaderSession.readingAvailable else {
            lastError = "NFC isn't available on this device."
            return
        }
        let session = NFCTagReaderSession(
            pollingOption: [.iso14443, .iso15693, .iso18092],
            delegate: self,
            queue: nil
        )
        session?.alertMessage = "Hold your iPhone near a club tag."
        self.session = session
        session?.begin()
        isScanning = true
    }

    func invalidate() {
        session?.invalidate()
        session = nil
        isScanning = false
    }
}

extension NFCRawReader: NFCTagReaderSessionDelegate {
    nonisolated func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    nonisolated func tagReaderSession(
        _ session: NFCTagReaderSession,
        didDetect tags: [NFCTag]
    ) {
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag detected.")
            return
        }
        session.connect(to: tag) { [weak self] error in
            if let error {
                session.invalidate(errorMessage: error.localizedDescription)
                Task { @MainActor [weak self] in
                    self?.lastError = error.localizedDescription
                    self?.isScanning = false
                }
                return
            }
            let uid = Self.extractUid(from: tag)
            if let uid {
                session.alertMessage = "Tag read."
                session.invalidate()
                Task { @MainActor [weak self] in
                    self?.lastUid = uid
                    self?.isScanning = false
                }
            } else {
                session.invalidate(errorMessage: "Couldn't read tag UID.")
                Task { @MainActor [weak self] in
                    self?.isScanning = false
                }
            }
        }
    }

    nonisolated func tagReaderSession(
        _ session: NFCTagReaderSession,
        didInvalidateWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.session = nil
            self.isScanning = false
        }
    }

    /// Extract the bytes that uniquely identify the tag and render them as
    /// an uppercased hex string (the format Kit-Trace and the GatherHub
    /// web admin both expect).
    private static func extractUid(from tag: NFCTag) -> String? {
        let bytes: Data
        switch tag {
        case .miFare(let mf):
            bytes = mf.identifier
        case .iso7816(let iso):
            bytes = iso.identifier
        case .iso15693(let iso):
            bytes = Data(iso.identifier.reversed())
        case .feliCa(let f):
            bytes = f.currentIDm
        @unknown default:
            return nil
        }
        return bytes.map { String(format: "%02X", $0) }.joined()
    }
}
