import SwiftUI

/// Capture form for a waste-load custody event — either a pickup or an
/// arrival. Submits offline through the sync queue exactly like
/// `FleetPreStartView`: build the payload, enqueue one op, then
/// `await sync.coordinator?.syncIfOnline()`.
///
/// The core event never blocks on the optional signature or the optional
/// bin scan — both are best-effort. (Signature upload is not wired yet; see
/// `SignatureCanvasView`.)
struct WasteCaptureView: View {
    enum Mode {
        case pickup
        case arrival

        var navTitle: String {
            switch self {
            case .pickup: return "Record pickup"
            case .arrival: return "Record arrival"
            }
        }

        var amountLabel: String {
            switch self {
            case .pickup: return "Pickup amount"
            case .arrival: return "Arrival amount"
            }
        }

        var kind: SyncOperationKind {
            switch self {
            case .pickup: return .wastePickup
            case .arrival: return .wasteArrival
            }
        }
    }

    let mode: Mode
    let load: WasteLoadSummary

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""
    @State private var unit: WasteUnit
    @State private var manifestNumber = ""
    @State private var notes = ""
    @State private var scannedContainer: String?
    @State private var showingScanner = false
    @State private var signatureStrokes: [[CGPoint]] = []
    @State private var saving = false
    @State private var errorMessage: String?

    init(mode: Mode, load: WasteLoadSummary) {
        self.mode = mode
        self.load = load
        // Default the unit to whatever the load already carries, else kg.
        let seededUnit: WasteUnit
        switch mode {
        case .pickup:
            seededUnit = load.pickupUnit ?? load.arrivalUnit ?? .kg
        case .arrival:
            seededUnit = load.arrivalUnit ?? load.pickupUnit ?? .kg
        }
        _unit = State(initialValue: seededUnit)
    }

    private var hasSignature: Bool { !signatureStrokes.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Load", value: load.title)
                    if let route = load.routeSummary {
                        LabeledContent("Route", value: route)
                    }
                    if let container = load.container, !container.isEmpty {
                        LabeledContent("Container", value: container)
                    }
                }

                Section(mode.amountLabel) {
                    TextField("Amount", text: $amount)
                        .keyboardType(.decimalPad)
                    Picker("Unit", selection: $unit) {
                        ForEach(WasteUnit.allCases) { unit in
                            Text(unit.displayName).tag(unit)
                        }
                    }
                }

                Section("Paperwork") {
                    TextField("Manifest number", text: $manifestNumber)
                        .textInputAutocapitalization(.characters)
                    TextField("Notes", text: $notes, axis: .vertical)
                }

                Section {
                    Button {
                        showingScanner = true
                    } label: {
                        Label(
                            scannedContainer == nil ? "Scan bin / container" : "Re-scan bin / container",
                            systemImage: "qrcode.viewfinder"
                        )
                    }
                    if let scannedContainer {
                        LabeledContent("Scanned", value: scannedContainer)
                            .font(.gh.caption)
                    }
                } footer: {
                    Text("Optional — confirms the physical container against this load.")
                }

                Section {
                    SignatureCanvasView(strokes: $signatureStrokes)
                } header: {
                    Text("Signature")
                } footer: {
                    Text("Optional. Captured locally; the load is recorded even without a signature or connection.")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.danger)
                    }
                }
            }
            .navigationTitle(mode.navTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Submitting…" : "Submit") {
                        Task { await submit() }
                    }
                    .disabled(saving)
                }
            }
            .sheet(isPresented: $showingScanner) {
                WasteContainerScanSheet { tagId in
                    scannedContainer = tagId
                    showingScanner = false
                }
            }
        }
    }

    private func submit() async {
        saving = true
        errorMessage = nil
        defer { saving = false }

        // One-shot GPS, best-effort. Never blocks the event.
        let location = await LocationService.shared.currentLocation()
        let latitude = location?.coordinate.latitude
        let longitude = location?.coordinate.longitude
        let accuracy = location?.horizontalAccuracy

        let trimmedAmount = amount.trimmingCharacters(in: .whitespaces)
        let amountValue = Double(trimmedAmount)
        let trimmedManifest = manifestNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        var noteText = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        // Fold the scanned container into the note so the field is captured
        // even though it isn't a first-class backend arg on these mutations.
        if let scannedContainer {
            let scanLine = "Scanned container: \(scannedContainer)"
            noteText = noteText.isEmpty ? scanLine : "\(noteText)\n\(scanLine)"
        }

        do {
            switch mode {
            case .pickup:
                _ = try sync.enqueue(
                    kind: .wastePickup,
                    title: "Pickup: \(load.title)",
                    payload: WastePickupPayload(
                        loadId: load.id,
                        amount: amountValue,
                        unit: unit.rawValue,
                        manifestNumber: trimmedManifest.isEmpty ? nil : trimmedManifest,
                        notes: noteText.isEmpty ? nil : noteText,
                        latitude: latitude,
                        longitude: longitude,
                        accuracy: accuracy
                    )
                )
            case .arrival:
                _ = try sync.enqueue(
                    kind: .wasteArrival,
                    title: "Arrival: \(load.title)",
                    payload: WasteArrivalPayload(
                        loadId: load.id,
                        amount: amountValue,
                        unit: unit.rawValue,
                        manifestNumber: trimmedManifest.isEmpty ? nil : trimmedManifest,
                        notes: noteText.isEmpty ? nil : noteText,
                        latitude: latitude,
                        longitude: longitude,
                        accuracy: accuracy
                    )
                )
            }
            await sync.coordinator?.syncIfOnline()
            dismiss()
        } catch {
            errorMessage = UserFacingError.message(
                error,
                fallback: "Couldn't queue this load."
            )
        }
    }
}

/// Add-a-note sheet for a load. Enqueues a `wasteCustodyNote` op offline.
struct WasteAddNoteView: View {
    let load: WasteLoadSummary

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var notes = ""
    @State private var saving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Load", value: load.title)
                }
                Section("Note") {
                    TextField("Add a custody note", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.danger)
                    }
                }
            }
            .navigationTitle("Add note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Submitting…" : "Submit") {
                        Task { await submit() }
                    }
                    .disabled(saving || notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func submit() async {
        saving = true
        errorMessage = nil
        defer { saving = false }

        let location = await LocationService.shared.currentLocation()
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        do {
            _ = try sync.enqueue(
                kind: .wasteCustodyNote,
                title: "Note: \(load.title)",
                payload: WasteCustodyNotePayload(
                    loadId: load.id,
                    notes: trimmed,
                    latitude: location?.coordinate.latitude,
                    longitude: location?.coordinate.longitude,
                    accuracy: location?.horizontalAccuracy
                )
            )
            await sync.coordinator?.syncIfOnline()
            dismiss()
        } catch {
            errorMessage = UserFacingError.message(
                error,
                fallback: "Couldn't queue this note."
            )
        }
    }
}

/// Thin wrapper that reuses the QR/NFC scan plumbing to capture a single
/// container tag id, then hands it back. Mirrors `ScanView`'s capture path
/// but resolves to a raw tag string rather than navigating to an asset.
struct WasteContainerScanSheet: View {
    let onScan: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = QRScannerController()
    @StateObject private var nfcRaw = NFCRawReader()

    var body: some View {
        NavigationStack {
            ZStack {
                QRScannerView(controller: camera)
                    .ignoresSafeArea()

                VStack {
                    Spacer()
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(.white.opacity(0.9), lineWidth: 3)
                        .frame(width: 240, height: 240)
                        .shadow(radius: 8)
                    Spacer()
                    controls
                }
            }
            .navigationTitle("Scan container")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { camera.start() }
            .onDisappear { camera.stop() }
            .onChange(of: camera.lastScanned) { _, value in handleScanned(value) }
            .onChange(of: nfcRaw.lastUid) { _, uid in handleScanned(uid) }
        }
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
        let resolved = TagParser.extractTagId(from: raw) ?? raw
        camera.stop()
        onScan(resolved)
    }
}
