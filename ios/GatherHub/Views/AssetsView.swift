import SwiftUI
import AVFoundation
import CoreNFC

/// Single field-ops surface that combines QR camera + NFC tap + manual
/// tag lookup. Replaces the previous separate Scan and Assets tabs:
/// the most common operation (scan a tag) lives at the top, with a
/// manual lookup fallback underneath.
struct AssetsView: View {
    let context: CurrentContext?

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
    @State private var allAssets: [AssetSummary] = []
    @State private var allAssetsError: String?
    @State private var loadingAllAssets = false
    @State private var creatingAsset = false

    init(context: CurrentContext? = nil) {
        self.context = context
    }

    private var canManageAssets: Bool {
        context?.role.canManageAssets ?? false
    }

    private var canDeleteAssets: Bool {
        context?.role.canDeleteAdministrativeRecords ?? false
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: GHSpacing.xl) {
                    cameraSection
                    nfcSection
                    checkedOutSection
                    inventorySection
                    manualLookupSection
                }
                .padding(GHSpacing.pageInset)
            }
            .refreshable { await loadAssets() }
            .background(Color.gh.paper.ignoresSafeArea())
            .navigationTitle("Assets")
            .toolbar {
                if canManageAssets {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            creatingAsset = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Create asset")
                    }
                }
            }
            .navigationDestination(
                isPresented: Binding(
                    get: { scannedTagId != nil },
                    set: { if !$0 { scannedTagId = nil } }
                )
            ) {
                if let tagId = scannedTagId {
                    AssetDetailView(
                        tagId: tagId,
                        canEdit: canManageAssets,
                        canDelete: canDeleteAssets
                    )
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
                Task { await loadAssets() }
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
            .sheet(isPresented: $creatingAsset) {
                AssetCreateSheet { asset, shouldReload in
                    upsertAsset(asset)
                    if shouldReload {
                        Task { await loadAssets() }
                    }
                }
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

    private var inventorySection: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack {
                Text("Inventory").ghLabelStyle()
                Spacer()
                if loadingAllAssets {
                    ProgressView()
                } else {
                    Text("\(allAssets.count)")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }

            GHCard(padding: 0) {
                if let allAssetsError {
                    VStack(alignment: .leading, spacing: GHSpacing.sm) {
                        Text("Couldn't load inventory")
                            .font(.gh.bodyStrong)
                            .foregroundStyle(Color.gh.inkStrong)
                        Text(allAssetsError)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                        Button("Retry") {
                            Task { await loadAllAssets() }
                        }
                        .buttonStyle(.gh(.outline, size: .sm))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(GHSpacing.lg)
                } else if allAssets.isEmpty {
                    Text("No assets recorded.")
                        .font(.gh.body)
                        .foregroundStyle(Color.gh.inkSoft)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(GHSpacing.lg)
                } else {
                    VStack(spacing: 0) {
                        ForEach(allAssets.prefix(20)) { asset in
                            Button {
                                if let tagId = asset.qrTagId ?? asset.nfcTagId {
                                    scannedTagId = tagId
                                }
                            } label: {
                                InventoryAssetRow(asset: asset)
                            }
                            .buttonStyle(.plain)
                            .disabled(asset.qrTagId == nil && asset.nfcTagId == nil)
                            if asset.id != allAssets.prefix(20).last?.id {
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

    private func loadAllAssets() async {
        let hasCachedAssets = (try? sync.store?.hasCachedAssets()) ?? false
        if hasCachedAssets {
            allAssets = (try? sync.store?.cachedAssets()) ?? []
        }
        loadingAllAssets = !hasCachedAssets && allAssets.isEmpty
        allAssetsError = nil
        defer { loadingAllAssets = false }
        do {
            let fresh = try await convex.listAssets()
            allAssets = fresh
            try? sync.store?.replaceAssets(fresh)
        } catch {
            if !hasCachedAssets && allAssets.isEmpty {
                allAssetsError = UserFacingError.message(
                    error,
                    fallback: "Couldn't load inventory."
                )
            }
        }
    }

    private func loadAssets() async {
        async let checkedOut: Void = loadCheckedOutAssets()
        async let inventory: Void = loadAllAssets()
        _ = await (checkedOut, inventory)
    }

    private func upsertAsset(_ asset: AssetSummary) {
        allAssets.removeAll { $0.id == asset.id }
        allAssets.append(asset)
        allAssets.sort { $0.name < $1.name }
        try? sync.store?.replaceAssets(allAssets)
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

private struct InventoryAssetRow: View {
    let asset: AssetSummary

    var body: some View {
        HStack(alignment: .top, spacing: GHSpacing.lg) {
            Image(systemName: "shippingbox")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Color.gh.accent)
                .frame(width: 40, height: 40)
                .background(Color.gh.accentWash)
                .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius))
            VStack(alignment: .leading, spacing: 2) {
                Text(asset.name)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                HStack(spacing: GHSpacing.sm) {
                    if let category = asset.category {
                        Text(category.taxonomyDisplayName)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                    if let serial = asset.serialNumber, !serial.isEmpty {
                        Text(serial)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                            .monospaced()
                    }
                }
                if let location = asset.location, !location.isEmpty {
                    Text(location)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            Spacer()
            if asset.id.hasPrefix("local:") {
                GHBadge(text: "Queued", variant: .warning)
            } else if let status = asset.status {
                AssetStatusBadge(status: status)
            }
        }
        .padding(GHSpacing.lg)
    }
}

private struct AssetCreateSheet: View {
    let onSaved: (_ saved: AssetSummary, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var categories: [TaxonomyOption] = []
    @State private var conditions: [TaxonomyOption] = []
    @State private var name = ""
    @State private var category = "equipment"
    @State private var description = ""
    @State private var serialNumber = ""
    @State private var condition = "good"
    @State private var location = ""
    @State private var notes = ""
    @State private var loadingOptions = false
    @State private var saving = false
    @State private var error: String?

    private var categoryOptions: [(key: String, label: String)] {
        categories.isEmpty ? createAssetCategoryFallback : categories.map { ($0.key, $0.label) }
    }

    private var conditionOptions: [(key: String, label: String)] {
        conditions.isEmpty ? createAssetConditionFallback : conditions.map { ($0.key, $0.label) }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section {
                        Text(error)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.danger)
                    }
                }
                Section("Asset") {
                    TextField("Name", text: $name)
                    Picker("Category", selection: $category) {
                        ForEach(categoryOptions, id: \.key) { option in
                            Text(option.label).tag(option.key)
                        }
                    }
                    Picker("Condition", selection: $condition) {
                        ForEach(conditionOptions, id: \.key) { option in
                            Text(option.label).tag(option.key)
                        }
                    }
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                    TextField("Serial number", text: $serialNumber)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    TextField("Location", text: $location)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .overlay {
                if loadingOptions {
                    ProgressView()
                }
            }
            .navigationTitle("New asset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving)
                }
            }
            .task { await loadOptions() }
        }
    }

    private func loadOptions() async {
        let hasCachedCategories = (try? sync.store?.hasCachedAssetCategories()) ?? false
        let hasCachedConditions = (try? sync.store?.hasCachedAssetConditions()) ?? false
        if hasCachedCategories {
            categories = (try? sync.store?.cachedAssetCategories()) ?? []
            selectDefaults()
        }
        if hasCachedConditions {
            conditions = (try? sync.store?.cachedAssetConditions()) ?? []
            selectDefaults()
        }
        if let defaults = try? sync.store?.cachedLocationDefaults(),
           let address = defaults.defaultAddress,
           location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            location = address
        }
        loadingOptions = !(hasCachedCategories && hasCachedConditions)
        defer { loadingOptions = false }
        do {
            async let categoryTask = convex.listAssetCategories()
            async let conditionTask = convex.listAssetConditions()
            async let defaultsTask = convex.locationDefaults()
            let (categoryRows, conditionRows, defaults) = try await (
                categoryTask,
                conditionTask,
                defaultsTask
            )
            categories = categoryRows
            conditions = conditionRows
            try? sync.store?.replaceAssetCategories(categoryRows)
            try? sync.store?.replaceAssetConditions(conditionRows)
            try? sync.store?.replaceLocationDefaults(defaults)
            if location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                location = defaults.defaultAddress ?? ""
            }
            selectDefaults()
        } catch {
            // Cached/default options keep creation available offline.
        }
    }

    private func save() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            error = "Name is required."
            return
        }
        saving = true
        defer { saving = false }
        error = nil
        let payload = CreateAssetPayload(
            name: trimmedName,
            category: category,
            description: cleaned(description),
            serialNumber: cleaned(serialNumber),
            condition: condition,
            location: cleaned(location),
            notes: cleaned(notes),
            nfcTagId: nil
        )
        do {
            let op = try sync.enqueue(
                kind: .assetCreate,
                title: "Create asset \(trimmedName)",
                payload: payload
            )
            let saved = AssetSummary(
                id: "local:\(op.clientId)",
                name: payload.name,
                category: payload.category,
                status: .available,
                custodianName: nil,
                location: payload.location,
                dueBack: nil,
                qrTagId: nil,
                nfcTagId: nil,
                serialNumber: payload.serialNumber
            )
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue asset creation.")
        }
    }

    private func selectDefaults() {
        if !categories.isEmpty && !categories.contains(where: { $0.key == category }) {
            category = (categories.first(where: { $0.isDefault }) ?? categories[0]).key
        }
        if !conditions.isEmpty && !conditions.contains(where: { $0.key == condition }) {
            condition = (conditions.first(where: { $0.isDefault }) ?? conditions[0]).key
        }
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private let createAssetCategoryFallback: [(key: String, label: String)] = [
    ("equipment", "Equipment"),
    ("apparel", "Apparel"),
    ("tool", "Tool"),
    ("electronics", "Electronics"),
    ("safety_equipment", "Safety equipment"),
    ("vehicle", "Vehicle"),
    ("key", "Key"),
    ("other", "Other"),
]

private let createAssetConditionFallback: [(key: String, label: String)] = [
    ("new", "New"),
    ("good", "Good"),
    ("fair", "Fair"),
    ("poor", "Poor"),
    ("damaged", "Damaged"),
]
