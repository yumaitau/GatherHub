import SwiftUI
import AVFoundation
import CoreNFC

/// Single field-ops surface that combines QR camera + NFC tap + manual
/// tag lookup. Replaces the previous separate Scan and Assets tabs:
/// the most common operation (scan a tag) lives at the top, with a
/// manual lookup fallback underneath.
struct AssetsView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @StateObject private var camera = QRScannerController()
    @StateObject private var nfcRaw = NFCRawReader()

    @State private var scannedTagId: String?
    @State private var rawInput = ""
    @State private var invalid = false
    @State private var showError = false
    @State private var checkedOutAssets: [AssetSummary] = []
    @State private var checkedOutError: String?
    @State private var loadingCheckedOut = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: GHSpacing.xl) {
                    cameraSection
                    nfcSection
                    checkedOutSection
                    manualLookupSection
                }
                .padding(GHSpacing.pageInset)
            }
            .refreshable { await loadCheckedOutAssets() }
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
                if NFCReaderSession.readingAvailable, !nfcRaw.isScanning {
                    nfcRaw.beginScanning()
                }
                Task { await loadCheckedOutAssets() }
            }
            .onDisappear { camera.stop() }
            .onChange(of: camera.lastScanned) { _, v in handleScanned(v) }
            .onChange(of: nfcRaw.lastUid) { _, v in handleScanned(v) }
            .onReceive(DeepLinkRouter.shared.$pendingTagId) { id in
                if let id {
                    scannedTagId = id
                    DeepLinkRouter.shared.pendingTagId = nil
                }
            }
            .alert("Not a GatherHub tag", isPresented: $showError) {
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
            .disabled(nfcRaw.isScanning || !NFCReaderSession.readingAvailable)
            if !NFCReaderSession.readingAvailable {
                Text("NFC isn't available on this device.")
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
            }
            if let error = UserFacingError.message(nfcRaw.lastError) {
                Text(error)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.danger)
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

    private var checkedOutSection: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack {
                Text("Checked out now").ghLabelStyle()
                Spacer()
                if loadingCheckedOut {
                    ProgressView()
                } else {
                    Text("\(checkedOutAssets.count)")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }

            GHCard(padding: 0) {
                if let checkedOutError {
                    VStack(alignment: .leading, spacing: GHSpacing.sm) {
                        Text("Couldn't load checked out assets")
                            .font(.gh.bodyStrong)
                            .foregroundStyle(Color.gh.inkStrong)
                        Text(checkedOutError)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                        Button("Retry") {
                            Task { await loadCheckedOutAssets() }
                        }
                        .buttonStyle(.gh(.outline, size: .sm))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(GHSpacing.lg)
                } else if checkedOutAssets.isEmpty {
                    Text("No assets are checked out.")
                        .font(.gh.body)
                        .foregroundStyle(Color.gh.inkSoft)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(GHSpacing.lg)
                } else {
                    VStack(spacing: 0) {
                        ForEach(checkedOutAssets) { asset in
                            Button {
                                if let tagId = asset.qrTagId ?? asset.nfcTagId {
                                    scannedTagId = tagId
                                }
                            } label: {
                                CheckedOutAssetRow(asset: asset)
                            }
                            .buttonStyle(.plain)
                            .disabled(asset.qrTagId == nil && asset.nfcTagId == nil)
                            if asset.id != checkedOutAssets.last?.id {
                                Divider()
                            }
                        }
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

    private func loadCheckedOutAssets() async {
        let hasCachedCheckedOutAssets = (try? sync.store?.hasCachedCheckedOutAssets()) ?? false
        if hasCachedCheckedOutAssets {
            checkedOutAssets = (try? sync.store?.cachedCheckedOutAssets()) ?? []
        }
        loadingCheckedOut = !hasCachedCheckedOutAssets && checkedOutAssets.isEmpty
        checkedOutError = nil
        defer { loadingCheckedOut = false }
        do {
            let fresh = try await convex.checkedOutAssets()
            checkedOutAssets = fresh
            try? sync.store?.replaceCheckedOutAssets(fresh)
        } catch {
            if !hasCachedCheckedOutAssets && checkedOutAssets.isEmpty {
                checkedOutError = UserFacingError.message(
                    error,
                    fallback: "Couldn't load checked out assets."
                )
            }
        }
    }
}

private struct CheckedOutAssetRow: View {
    let asset: AssetSummary

    var body: some View {
        HStack(alignment: .top, spacing: GHSpacing.lg) {
            Image(systemName: "shippingbox")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Color.gh.warning)
                .frame(width: 40, height: 40)
                .background(Color.gh.warningWash)
                .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius))

            VStack(alignment: .leading, spacing: GHSpacing.xs) {
                Text(asset.name)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Text(asset.custodianName ?? "Unassigned custodian")
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
                if let location = asset.location, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
                if let due = asset.dueBackDate {
                    Label(
                        due.formatted(date: .abbreviated, time: .shortened),
                        systemImage: "calendar"
                    )
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
                }
            }

            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.gh.inkQuiet)
                .padding(.top, GHSpacing.md)
        }
        .padding(GHSpacing.lg)
        .contentShape(Rectangle())
    }
}
