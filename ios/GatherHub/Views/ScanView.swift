import SwiftUI
import AVFoundation
import CoreNFC

/// Field-ops scan surface. Auto-starts an NFC raw-UID read on appear so
/// staff can tap-and-go without hunting for a button; falls back to a
/// live QR camera preview underneath. Mirrors the Kit-Trace flow:
///   1. Open screen → NFC session begins.
///   2. Tag tapped → raw hardware UID captured.
///   3. Look up the asset via `tags:lookupAuthed`; recordScan with
///      geolocation if found; offer "register tag" if not.
///
/// QR codes encoded as `https://app.gatherhub.au/a/tag_xxx` or
/// `gatherhub://asset/tag_xxx` are normalised through `TagParser`.
struct ScanView: View {
    @EnvironmentObject private var convex: ConvexService
    @StateObject private var camera = QRScannerController()
    @StateObject private var nfcRaw = NFCRawReader()
    @StateObject private var nfcNdef = NFCScanner()

    @State private var scannedTagId: String?
    @State private var showError = false
    @State private var autoStartedNfc = false

    var body: some View {
        NavigationStack {
            ZStack {
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
            .navigationDestination(
                isPresented: Binding(
                    get: { scannedTagId != nil },
                    set: { if !$0 { scannedTagId = nil } }
                )
            ) {
                if let tagId = scannedTagId {
                    AssetDetailView(tagId: tagId)
                }
            }
            .onAppear {
                camera.start()
                // Auto-start an NFC session the first time the tab appears
                // in a session, mirroring Kit-Trace's "tap to scan" feel.
                if !autoStartedNfc, NFCTagReaderSession.readingAvailable {
                    autoStartedNfc = true
                    nfcRaw.beginScanning()
                }
            }
            .onDisappear { camera.stop() }
            .onChange(of: camera.lastScanned) { _, value in handleScanned(value) }
            .onChange(of: nfcNdef.lastScanned) { _, value in handleScanned(value) }
            .onChange(of: nfcRaw.lastUid) { _, uid in handleScanned(uid) }
            .onReceive(DeepLinkRouter.shared.$pendingTagId) { tagId in
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

    private var scanReticle: some View {
        RoundedRectangle(cornerRadius: 16)
            .stroke(.white.opacity(0.9), lineWidth: 3)
            .frame(width: 240, height: 240)
            .shadow(radius: 8)
            .overlay(
                Text("Point at a QR code or tap a tag")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .padding(.top, 8),
                alignment: .bottom
            )
    }

    @ViewBuilder
    private var controls: some View {
        VStack(spacing: 12) {
            if NFCTagReaderSession.readingAvailable {
                Button {
                    nfcRaw.beginScanning()
                } label: {
                    Label(
                        nfcRaw.isScanning ? "Scanning…" : "Tap an NFC tag",
                        systemImage: "wave.3.right"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(nfcRaw.isScanning)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    private func handleScanned(_ raw: String?) {
        guard let raw, !raw.isEmpty else { return }
        if let tagId = TagParser.extractTagId(from: raw) {
            scannedTagId = tagId
            camera.stop()
        } else if raw.count <= 64,
                  raw.range(of: "^[0-9A-Fa-f]+$", options: .regularExpression) != nil {
            // Looks like a raw NFC hex UID. The server stores tag ids as
            // opaque strings, so pass it through.
            scannedTagId = raw.uppercased()
            camera.stop()
        } else {
            showError = true
        }
    }
}

// MARK: - QR scanning (AVFoundation)

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
        if value != lastScanned {
            lastScanned = value
            haptic()
        }
    }
}

private func haptic() {
    #if canImport(UIKit)
    UINotificationFeedbackGenerator().notificationOccurred(.success)
    #endif
}

struct QRScannerView: UIViewRepresentable {
    let controller: QRScannerController

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.videoPreviewLayer.session = controller.session
        view.videoPreviewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var videoPreviewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}

// MARK: - NFC NDEF scanning (Core NFC)

/// NDEF reader retained for tags provisioned with a club URL. Newer
/// blank tags emit only a UID — handled by `NFCRawReader` above.
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
        self.session = nil
    }

    private static func string(from record: NFCNDEFPayload) -> String? {
        if record.typeNameFormat == .nfcWellKnown,
           let type = String(data: record.type, encoding: .utf8) {
            if type == "U" { return uriString(from: record.payload) }
            if type == "T" { return textString(from: record.payload) }
        }
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
