import SwiftUI
import AVFoundation
import CoreNFC

/// Single field-ops surface that combines QR camera + NFC tap + manual
/// tag lookup. Replaces the previous separate Scan and Assets tabs:
/// the most common operation (scan a tag) lives at the top, with a
/// manual lookup fallback underneath.
struct AssetsView: View {
    @StateObject private var camera = QRScannerController()
    @StateObject private var nfcRaw = NFCRawReader()
    @StateObject private var nfcNdef = NFCScanner()

    @State private var scannedTagId: String?
    @State private var rawInput = ""
    @State private var invalid = false
    @State private var showError = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: GHSpacing.xl) {
                    cameraSection
                    nfcSection
                    manualLookupSection
                }
                .padding(GHSpacing.pageInset)
            }
            .background(Color.gh.paper.ignoresSafeArea())
            .navigationTitle("Assets")
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
                // Match Kit-Trace: auto-poll an NFC session every time
                // the Assets tab appears (not just once per launch) so
                // tapping the tab is the only action needed to scan.
                if NFCTagReaderSession.readingAvailable, !nfcRaw.isScanning {
                    nfcRaw.beginScanning()
                }
            }
            .onDisappear { camera.stop() }
            .onChange(of: camera.lastScanned) { _, v in handleScanned(v) }
            .onChange(of: nfcNdef.lastScanned) { _, v in handleScanned(v) }
            .onChange(of: nfcRaw.lastUid) { _, v in handleScanned(v) }
            .onReceive(DeepLinkRouter.shared.$pendingTagId) { id in
                if let id {
                    scannedTagId = id
                    DeepLinkRouter.shared.pendingTagId = nil
                }
            }
            .alert("Not a GatherHub tag", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("That code doesn't look like a club asset tag.")
            }
        }
    }

    // MARK: Sections

    private var cameraSection: some View {
        VStack(spacing: GHSpacing.sm) {
            Text("Scan a QR code").ghLabelStyle()
            ZStack {
                QRScannerView(controller: camera)
                    .aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous))
                RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous)
                    .stroke(Color.gh.hairline, lineWidth: 1)
                RoundedRectangle(cornerRadius: 16)
                    .stroke(.white.opacity(0.85), lineWidth: 3)
                    .frame(width: 200, height: 200)
                    .shadow(radius: 6)
            }
        }
    }

    private var nfcSection: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            Text("Tap an NFC tag").ghLabelStyle()
            Button {
                nfcRaw.beginScanning()
            } label: {
                Label(
                    nfcRaw.isScanning ? "Scanning…" : "Start NFC scan",
                    systemImage: "wave.3.right"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.gh(.primary))
            .disabled(nfcRaw.isScanning || !NFCTagReaderSession.readingAvailable)
            if !NFCTagReaderSession.readingAvailable {
                Text("NFC isn't available on this device.")
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
            }
        }
    }

    private var manualLookupSection: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            Text("Manual lookup").ghLabelStyle()
            GHCard(padding: GHSpacing.lg) {
                VStack(alignment: .leading, spacing: GHSpacing.md) {
                    TextField("tag_ab12cd34… or a tag URL", text: $rawInput)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(lookup)
                    Button {
                        lookup()
                    } label: {
                        Text("Look up asset")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.gh(.outline))
                    .disabled(rawInput.trimmingCharacters(in: .whitespaces).isEmpty)
                    if invalid {
                        Text("That doesn't contain a valid GatherHub tag id.")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.danger)
                    }
                }
            }
        }
    }

    // MARK: Actions

    private func handleScanned(_ raw: String?) {
        guard let raw, !raw.isEmpty else { return }
        if let id = TagParser.extractTagId(from: raw) {
            scannedTagId = id
            camera.stop()
        } else if raw.count <= 64,
                  raw.range(of: "^[0-9A-Fa-f]+$", options: .regularExpression) != nil {
            scannedTagId = raw.uppercased()
            camera.stop()
        } else {
            showError = true
        }
    }

    private func lookup() {
        invalid = false
        if let id = TagParser.extractTagId(from: rawInput) {
            scannedTagId = id
        } else {
            invalid = true
        }
    }
}
