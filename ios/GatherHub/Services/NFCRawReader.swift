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
        // Drop any stale session so a previous "no tag detected" timeout
        // doesn't block a re-arm.
        invalidate()
        lastError = nil

        guard NFCTagReaderSession.readingAvailable else {
            lastError = "NFC isn't available on this device or hasn't been turned on. iOS only allows NFC reading on iPhone 7 and later, and the simulator doesn't support it."
            return
        }
        guard let session = NFCTagReaderSession(
            pollingOption: [.iso14443, .iso15693, .iso18092],
            delegate: self,
            queue: nil
        ) else {
            // The initialiser only returns nil when the entitlement is
            // missing or the App ID hasn't been enabled for Near Field
            // Communication Tag Reading in the Apple Developer portal.
            lastError = "Couldn't start an NFC session. Make sure 'Near Field Communication Tag Reading' is enabled for the App ID in the Apple Developer portal and that the signed app embeds the com.apple.developer.nfc.readersession.formats entitlement."
            return
        }
        // Wording mirrors Kit-Trace's flutter_nfc_kit prompts exactly so
        // the system NFC sheet reads the same in both apps.
        session.alertMessage = "Hold your iPhone near the NFC tag"
        self.session = session
        session.begin()
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
                // Kit-Trace's success message verbatim.
                session.alertMessage = "Tag scanned successfully!"
                session.invalidate()
                Task { @MainActor [weak self] in
                    self?.lastUid = uid
                    self?.isScanning = false
                }
            } else {
                session.invalidate(errorMessage: "Error reading tag")
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
        // CoreNFC error codes — most relevant for "sheet never appeared":
        //   readerSessionInvalidationErrorSessionTimeout (203) — normal idle.
        //   readerSessionInvalidationErrorUserCanceled (200)  — user dismissed.
        //   readerSessionInvalidationErrorSystemIsBusy (203)  — another reader is up.
        //   readerSessionInvalidationErrorFirstNDEFTagRead    — not relevant here.
        //   readerError.securityViolation                     — missing entitlement / capability.
        let nfcError = error as NSError
        let message: String?
        if let code = NFCReaderError.Code(rawValue: nfcError.code) {
            switch code {
            case .readerSessionInvalidationErrorUserCanceled:
                message = nil
            case .readerSessionInvalidationErrorSessionTimeout:
                message = nil
            case .readerSessionInvalidationErrorSystemIsBusy:
                message = "iOS NFC reader is busy. Close any other NFC apps and try again."
            case .readerErrorSecurityViolation:
                message = "NFC was blocked at the OS level. The Apple Developer portal App ID likely doesn't have 'Near Field Communication Tag Reading' enabled, or the provisioning profile is stale. Re-generate the profile after enabling the capability."
            case .readerErrorUnsupportedFeature:
                message = "This iPhone doesn't support NFC tag reading."
            default:
                message = error.localizedDescription
            }
        } else {
            message = error.localizedDescription
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.session = nil
            self.isScanning = false
            if let message { self.lastError = message }
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
