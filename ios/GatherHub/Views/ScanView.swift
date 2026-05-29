import SwiftUI
import AVFoundation
import CoreNFC

/// Scan a club asset by QR (camera) or NFC (tap). On a successful tag id
/// extraction, navigates to the asset detail.
///
/// QR codes encode either `https://app.gatherhub.au/a/tag_xxx` or the deep link
/// `gatherhub://asset/tag_xxx`; NFC NDEF records typically carry the same URL.
/// `TagParser.extractTagId(from:)` normalises all forms to the bare id.
struct ScanView: View {
    @StateObject private var camera = QRScannerController()
    @StateObject private var nfc = NFCScanner()

    /// Tag id to push detail for. Drives navigation.
    @State private var scannedTagId: String?
    @State private var showError = false

    var body: some View {
        NavigationStack {
            ZStack {
                // Live camera preview for QR scanning.
                QRScannerView(controller: camera)
                    .ignoresSafeArea()

                VStack {
                    Spacer()
                    scanReticle
                    Spacer()
                    controls
                }
            }
            .navigationTitle("Scan kit")
            .navigationBarTitleDisplayMode(.inline)
            // iOS 16 navigation: drive a hidden link from `scannedTagId`.
            .background(
                NavigationLink(
                    isActive: Binding(
                        get: { scannedTagId != nil },
                        set: { if !$0 { scannedTagId = nil } }
                    )
                ) {
                    if let tagId = scannedTagId {
                        AssetDetailView(tagId: tagId)
                    }
                } label: { EmptyView() }
                .hidden()
            )
            .onAppear { camera.start() }
            .onDisappear { camera.stop() }
            .onChange(of: camera.lastScanned) { value in handleScanned(value) }
            .onChange(of: nfc.lastScanned) { value in handleScanned(value) }
            .onReceive(DeepLinkRouter.shared.$pendingTagId) { tagId in
                // A gatherhub://asset/tag_xxx deep link arrived.
                if let tagId {
                    scannedTagId = tagId
                    DeepLinkRouter.shared.pendingTagId = nil
                }
            }
            .alert("Not a GatherHub tag", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("That code doesn't look like a club asset tag. Try again.")
            }
        }
    }

    // MARK: - Subviews

    private var scanReticle: some View {
        RoundedRectangle(cornerRadius: 16)
            .stroke(.white.opacity(0.9), lineWidth: 3)
            .frame(width: 240, height: 240)
            .shadow(radius: 8)
            .overlay(
                Text("Point at a QR code")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .padding(.top, 8),
                alignment: .bottom
            )
    }

    private var controls: some View {
        VStack(spacing: 12) {
            if NFCNDEFReaderSession.readingAvailable {
                Button {
                    nfc.beginScanning()
                } label: {
                    Label("Tap an NFC tag", systemImage: "wave.3.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    // MARK: - Handling

    private func handleScanned(_ raw: String?) {
        guard let raw, !raw.isEmpty else { return }
        if let tagId = TagParser.extractTagId(from: raw) {
            scannedTagId = tagId
            camera.stop()
        } else {
            showError = true
        }
    }
}

// MARK: - QR scanning (AVFoundation)

/// Drives an `AVCaptureSession` configured for QR metadata. Publishes the most
/// recently decoded string.
final class QRScannerController: NSObject, ObservableObject, AVCaptureMetadataOutputObjectsDelegate {
    @Published var lastScanned: String?

    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "au.gatherhub.qr.session")
    private var configured = false

    func start() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.configureIfNeeded()
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.session.isRunning { self.session.stopRunning() }
        }
    }

    private func configureIfNeeded() {
        guard !configured else { return }
        configured = true

        session.beginConfiguration()
        guard
            let device = AVCaptureDevice.default(for: .video),
            let input = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input)
        else {
            session.commitConfiguration()
            return
        }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
        }
        session.commitConfiguration()
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard
            let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
            let value = object.stringValue
        else { return }
        // Publish only when the value changes to avoid repeated navigations.
        if value != lastScanned {
            lastScanned = value
            AudioServicesPlayHaptic()
        }
    }
}

/// Light haptic helper (best-effort; no-op if unavailable).
private func AudioServicesPlayHaptic() {
    #if canImport(UIKit)
    UINotificationFeedbackGenerator().notificationOccurred(.success)
    #endif
}

/// SwiftUI host for the camera preview layer.
struct QRScannerView: UIViewRepresentable {
    let controller: QRScannerController

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.videoPreviewLayer.session = controller.session
        view.videoPreviewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    /// A UIView whose backing layer is an `AVCaptureVideoPreviewLayer`.
    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var videoPreviewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}

// MARK: - NFC scanning (Core NFC)

/// Reads NDEF messages from an NFC tag and extracts the GatherHub tag id from
/// the first URI/text record. Requires the
/// `com.apple.developer.nfc.readersession.formats` entitlement and the
/// `NFCReaderUsageDescription` Info.plist key.
final class NFCScanner: NSObject, ObservableObject, NFCNDEFReaderSessionDelegate {
    @Published var lastScanned: String?

    private var session: NFCNDEFReaderSession?

    func beginScanning() {
        guard NFCNDEFReaderSession.readingAvailable else { return }
        let session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: true)
        session.alertMessage = "Hold your iPhone near the asset tag."
        self.session = session
        session.begin()
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        for message in messages {
            for record in message.records {
                if let payload = Self.string(from: record) {
                    DispatchQueue.main.async { self.lastScanned = payload }
                    session.invalidate()
                    return
                }
            }
        }
        session.invalidate(errorMessage: "No GatherHub tag found.")
    }

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        // User cancel / timeout / read error: nothing to surface aggressively.
        self.session = nil
    }

    /// Decode an NDEF record into a string (URI records and Text records).
    private static func string(from record: NFCNDEFPayload) -> String? {
        // Well Known URI record (type "U"): first byte is a URI prefix code.
        if record.typeNameFormat == .nfcWellKnown,
           let type = String(data: record.type, encoding: .utf8) {
            if type == "U" {
                return uriString(from: record.payload)
            }
            if type == "T" {
                return textString(from: record.payload)
            }
        }
        // Fallback: raw UTF-8 of the payload.
        return String(data: record.payload, encoding: .utf8)
    }

    private static func uriString(from payload: Data) -> String? {
        guard let first = payload.first else { return nil }
        let prefixes = [
            "", "http://www.", "https://www.", "http://", "https://",
            "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.",
            "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://",
            "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:",
            "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://",
            "tcpobex://", "irdaobex://", "file://", "urn:epc:id:",
            "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:",
            "urn:nfc:",
        ]
        let prefix = Int(first) < prefixes.count ? prefixes[Int(first)] : ""
        let rest = payload.dropFirst()
        return prefix + (String(data: rest, encoding: .utf8) ?? "")
    }

    private static func textString(from payload: Data) -> String? {
        guard let status = payload.first else { return nil }
        let langCodeLength = Int(status & 0x3F)
        let textData = payload.dropFirst(1 + langCodeLength)
        return String(data: textData, encoding: .utf8)
    }
}
