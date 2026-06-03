import SwiftUI
import AVFoundation
import CoreNFC

/// Field-ops scan surface. Shows a live QR camera preview and lets staff
/// explicitly start an NFC raw-UID read when they need to tap a tag:
///   1. Point the camera at a QR code, or tap the NFC button.
///   2. QR payload or NFC raw hardware UID is captured.
///   3. Look up the asset via `tags:lookupAuthed`; recordScan with
///      geolocation if found; offer "register tag" if not.
///
/// QR codes encoded as `https://app.gatherhub.au/a/tag_xxx` or
/// `gatherhub://asset/tag_xxx` are normalised through `TagParser`.
struct ScanView: View {
    @EnvironmentObject private var convex: ConvexService
    @StateObject private var camera = QRScannerController()
    @StateObject private var nfcRaw = NFCRawReader()

    @State private var scannedTagId: String?
    @State private var showError = false

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
            }
            .onDisappear { camera.stop() }
            .onChange(of: camera.lastScanned) { _, value in handleScanned(value) }
            .onChange(of: nfcRaw.lastUid) { _, uid in handleScanned(uid) }
            .onReceive(DeepLinkRouter.shared.$pendingTagId) { tagId in
                if let tagId {
                    scannedTagId = tagId
                    DeepLinkRouter.shared.pendingTagId = nil
                }
            }
            .alert("Not a GatherHub tag", isPresented: $showError) {
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
                Text("Point at a QR code or start NFC")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .padding(.top, 8),
                alignment: .bottom
            )
    }

    @ViewBuilder
    private var controls: some View {
        VStack(spacing: 12) {
            if NFCReaderSession.readingAvailable {
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
            if let error = UserFacingError.message(nfcRaw.lastError) {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(Color.gh.danger)
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
