import Foundation
@preconcurrency import CoreNFC
import os.log

/// Reads the raw hardware UID of an ISO 14443 / 15693 NFC tag using
/// `NFCTagReaderSession`. Mirrors Kit-Trace's `flutter_nfc_kit` behaviour:
/// any tag (not just an NDEF-provisioned one) emits its UID immediately.
@MainActor
final class NFCRawReader: NSObject, ObservableObject {
    @Published var lastUid: String?
    @Published var isScanning = false
    @Published var lastError: String?

    private var session: NFCTagReaderSession?
    private var watchdog: DispatchWorkItem?
    private let log = Logger(subsystem: "au.com.gatherhub", category: "nfc")

    func beginScanning() {
        // Drop any stale session so a previous "no tag detected" timeout
        // doesn't block a re-arm.
        invalidate()
        lastError = nil

        guard NFCReaderSession.readingAvailable else {
            lastError = "NFC isn't available on this device or hasn't been turned on. iOS only allows NFC reading on iPhone 7 and later, and the simulator doesn't support it."
            return
        }
        guard let session = NFCTagReaderSession(
            pollingOption: [.iso14443, .iso15693],
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
        log.info("NFC: NFCTagReaderSession.begin() called")

        // Watchdog: if the session never goes active within 3 seconds
        // and never invalidates, the system silently swallowed begin().
        // That happens when the App ID lacks NFC capability or the
        // signed app has no com.apple.developer.nfc... entitlement
        // after provisioning — surface a specific message so the user
        // knows where to fix it instead of staring at "Scanning…".
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard self.isScanning, self.lastUid == nil else { return }
                self.log.error("NFC: watchdog tripped — sheet never appeared")
                self.session?.invalidate()
                self.session = nil
                self.isScanning = false
                self.lastError = "NFC didn't start. The most common cause is the App ID missing 'Near Field Communication Tag Reading' at developer.apple.com → Identifiers → au.com.gatherhub → Capabilities. After enabling it there, re-download the provisioning profile (Xcode → Settings → Accounts → Download Manual Profiles) and rebuild."
            }
        }
        watchdog = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
    }

    func invalidate() {
        watchdog?.cancel()
        watchdog = nil
        session?.invalidate()
        session = nil
        isScanning = false
    }
}

extension NFCRawReader: NFCTagReaderSessionDelegate {
    nonisolated func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            // Sheet is up — cancel the watchdog so we don't falsely
            // surface the missing-entitlement message.
            self.watchdog?.cancel()
            self.watchdog = nil
            self.log.info("NFC: session became active — sheet presented")
        }
    }

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
                let message = UserFacingError.message(
                    error,
                    fallback: "Couldn't read this NFC tag."
                )
                session.invalidate(errorMessage: message)
                Task { @MainActor [weak self] in
                    self?.lastError = message
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
                message = UserFacingError.message(error, fallback: "Couldn't read this NFC tag.")
            }
        } else {
            message = UserFacingError.message(error, fallback: "Couldn't read this NFC tag.")
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.watchdog?.cancel()
            self.watchdog = nil
            self.session = nil
            self.isScanning = false
            self.log.error("NFC: session invalidated (code=\(nfcError.code)) — \(error.localizedDescription)")
            if let message { self.lastError = message }
        }
    }

    /// Extract the bytes that uniquely identify the tag and render them as
    /// an uppercased hex string (the format Kit-Trace and the GatherHub
    /// web admin both expect).
    nonisolated private static func extractUid(from tag: NFCTag) -> String? {
        let bytes: Data
        switch tag {
        case .miFare(let mf):
            bytes = mf.identifier
        case .iso7816(let iso):
            bytes = iso.identifier
        case .iso15693(let iso):
            // Match flutter_nfc_kit: return CoreNFC's identifier byte order.
            bytes = iso.identifier
        case .feliCa(let f):
            bytes = f.currentIDm
        @unknown default:
            return nil
        }
        return bytes.map { byte in
            let hex = String(byte, radix: 16, uppercase: true)
            return hex.count == 1 ? "0\(hex)" : hex
        }.joined()
    }
}
