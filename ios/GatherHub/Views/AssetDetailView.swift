import SwiftUI

/// Shows a looked-up asset (`tags:lookupAuthed`) and offers Check Out / Check In.
///
/// MVVM-lite: a small `@StateObject` view model owns the async loading and the
/// check-in/out mutations so the view stays declarative.
struct AssetDetailView: View {
    let tagId: String
    let canEdit: Bool
    let canDelete: Bool
    let canOperate: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @StateObject private var model = AssetDetailViewModel()
    @State private var showCustodianPicker = false
    @State private var showAssetPicker = false
    @State private var showCheckOutLocation = false
    @State private var showCheckInLocation = false
    @State private var pendingCheckOutMember: Member?
    @State private var editingAsset: Asset?
    @State private var retiringAsset: Asset?
    @State private var deletingAsset: Asset?

    init(tagId: String, canEdit: Bool = false, canDelete: Bool = false, canOperate: Bool? = nil) {
        self.tagId = tagId
        self.canEdit = canEdit
        self.canDelete = canDelete
        self.canOperate = canOperate ?? canEdit
    }

    var body: some View {
        content
            .navigationTitle("Asset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let asset = model.loadedAsset, canEdit || canDelete {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            if canEdit {
                                Button {
                                    editingAsset = asset
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                            }
                            if canOperate && asset.status != .retired {
                                Button {
                                    retiringAsset = asset
                                } label: {
                                    Label("Retire", systemImage: "archivebox")
                                }
                            }
                            if canDelete {
                                Button(role: .destructive) {
                                    deletingAsset = asset
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .accessibilityLabel("Asset actions")
                    }
                }
            }
            .task {
                await model.load(tagId: tagId, convex: convex, sync: sync)
                if case .loaded = model.phase {
                    // Background: log a sighting with geo coords.
                    Task { await model.logScan(convex: convex, sync: sync) }
                }
            }
            .sheet(isPresented: $showCustodianPicker) {
                MemberPickerView { member in
                    pendingCheckOutMember = member
                    showCustodianPicker = false
                    showCheckOutLocation = true
                }
            }
            .sheet(isPresented: $showCheckOutLocation) {
                if let pendingCheckOutMember {
                    AssetLocationSheet(
                        title: "Check out location",
                        actionTitle: "Check out",
                        defaultAddress: model.defaultAddress,
                        initialLocation: model.currentAssetLocation
                    ) { location in
                        Task {
                            await model.checkOut(
                                to: pendingCheckOutMember,
                                location: location,
                                convex: convex,
                                sync: sync
                            )
                            self.pendingCheckOutMember = nil
                        }
                    }
                }
            }
            .sheet(isPresented: $showCheckInLocation) {
                AssetLocationSheet(
                    title: "Check in location",
                    actionTitle: "Check in",
                    defaultAddress: model.defaultAddress,
                    initialLocation: model.currentAssetLocation
                ) { location in
                    Task { await model.checkIn(location: location, convex: convex, sync: sync) }
                }
            }
            .sheet(isPresented: $showAssetPicker) {
                AssetPickerSheet(tagId: tagId) { shouldReload in
                    showAssetPicker = false
                    if shouldReload {
                        Task { await model.load(tagId: tagId, convex: convex, sync: sync) }
                    }
                }
            }
            .sheet(item: $editingAsset) { asset in
                AssetEditorSheet(asset: asset) { saved, shouldReload in
                    model.applyLocalAsset(saved, sync: sync)
                    if shouldReload {
                        Task { await model.load(tagId: tagId, convex: convex, sync: sync) }
                    }
                }
            }
            .sheet(item: $retiringAsset) { asset in
                AssetRetireSheet(asset: asset) { notes in
                    await model.retire(asset: asset, notes: notes, convex: convex, sync: sync)
                }
            }
            .confirmationDialog(
                "Delete this asset?",
                isPresented: Binding(
                    get: { deletingAsset != nil },
                    set: { if !$0 { deletingAsset = nil } }
                ),
                titleVisibility: .visible
            ) {
                if let asset = deletingAsset {
                    Button("Delete", role: .destructive) {
                        Task { await model.delete(asset: asset, convex: convex, sync: sync) }
                    }
                }
            } message: {
                if let asset = deletingAsset {
                    Text(asset.name)
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            ProgressView("Looking up tag…")
        case .notFound:
            VStack(spacing: 16) {
                EmptyStateView(
                    title: "Tag not registered",
                    systemImage: "questionmark.circle",
                    message: "This tag isn't bound to a club asset yet. Register it now so future scans recognise it."
                )
                if canEdit {
                    Button {
                        showAssetPicker = true
                    } label: {
                        Label("Register this tag", systemImage: "tag.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.horizontal)
                }
            }
        case .failed(let message):
            OfflineStateView(
                title: "Couldn't load asset",
                message: message,
                retry: { await model.load(tagId: tagId, convex: convex, sync: sync) }
            )
        case .loaded(let asset, let custodian):
            assetDetail(asset, custodian: custodian)
        }
    }

    private func assetDetail(_ asset: Asset, custodian: Member?) -> some View {
        List {
            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(asset.name).font(.title3.bold())
                        Text(asset.category.taxonomyDisplayName).foregroundStyle(.secondary)
                    }
                    Spacer()
                    AssetStatusBadge(status: asset.status)
                }
            }

            Section("Details") {
                if let description = asset.description, !description.isEmpty {
                    LabeledContent("Description", value: description)
                }
                if let serial = asset.serialNumber, !serial.isEmpty {
                    LabeledContent("Serial", value: serial)
                }
                LabeledContent("Condition", value: asset.condition.taxonomyDisplayName)
                if let location = asset.location, !location.isEmpty {
                    LabeledContent("Location", value: location)
                }
                if let custodian {
                    LabeledContent("With", value: custodian.fullName)
                }
                if let due = asset.dueBackDate {
                    LabeledContent("Due back", value: due.formatted(date: .abbreviated, time: .shortened))
                }
            }

            Section("Tags") {
                if let qrTagId = asset.qrTagId, !qrTagId.isEmpty {
                    LabeledContent("QR", value: qrTagId)
                        .font(.gh.mono)
                }
                if let nfcTagId = asset.nfcTagId, !nfcTagId.isEmpty {
                    LabeledContent("NFC", value: nfcTagId)
                        .font(.gh.mono)
                }
            }

            Section("History") {
                if model.history.isEmpty {
                    Text("No history recorded yet.")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                } else {
                    ForEach(model.history.prefix(12)) { entry in
                        AssetHistoryEntryRow(entry: entry)
                    }
                }
            }

            if canOperate {
                Section {
                    actions(for: asset)
                } footer: {
                    if model.isBusy {
                        ProgressView()
                    }
                }
            }
        }
        .overlay(alignment: .top) {
            ErrorBanner(message: $model.actionError)
        }
    }

    @ViewBuilder
    private func actions(for asset: Asset) -> some View {
        switch asset.status {
        case .available:
            Button {
                showCustodianPicker = true
            } label: {
                Label("Check out", systemImage: "arrow.up.forward.square")
            }
            .disabled(model.isBusy)

        case .checkedOut, .inUse:
            Button {
                showCheckInLocation = true
            } label: {
                Label("Check in", systemImage: "arrow.down.forward.square")
            }
            .disabled(model.isBusy)

        case .maintenance, .lost, .retired:
            Text("No field actions available for a \(asset.status.displayName.lowercased()) asset.")
                .foregroundStyle(.secondary)
                .font(.footnote)
        }
    }
}

/// View model owning the asset lookup + check-in/out mutations.
@MainActor
final class AssetDetailViewModel: ObservableObject {
    enum Phase {
        case loading
        case notFound
        case loaded(Asset, custodian: Member?)
        case failed(String)
    }

    @Published var phase: Phase = .loading
    @Published var isBusy = false
    @Published var actionError: String?
    @Published var defaultAddress: String?
    @Published var history: [AssetHistoryEntry] = []

    private var currentTagId: String?
    private var currentLookup: TagLookupResult?
    var loadedAsset: Asset? {
        if case .loaded(let asset, _) = phase {
            return asset
        }
        return nil
    }

    var currentAssetLocation: String? {
        if case .loaded(let asset, _) = phase {
            return asset.location
        }
        return nil
    }

    func load(tagId: String, convex: ConvexService, sync: SyncEnvironment) async {
        currentTagId = tagId
        if let defaults = try? sync.store?.cachedLocationDefaults() {
            defaultAddress = defaults.defaultAddress
        }
        if let cached = try? sync.store?.cachedTagLookup(tagId: tagId) {
            apply(cached)
            if let assetId = cached.asset?.id {
                history = (try? sync.store?.cachedAssetHistory(assetId: assetId)) ?? []
            }
        } else {
            phase = .loading
            history = []
        }
        do {
            if let defaults = try? await convex.locationDefaults() {
                defaultAddress = defaults.defaultAddress
                try? sync.store?.replaceLocationDefaults(defaults)
            }
            let result = try await convex.lookupTag(tagId)
            try? sync.store?.replaceTagLookup(result, tagId: tagId)
            apply(result)
            if result.found, let asset = result.asset {
                let hasCachedHistory = (try? sync.store?.hasCachedAssetHistory(assetId: asset.id)) ?? false
                do {
                    history = try await convex.assetHistory(assetId: asset.id)
                    try? sync.store?.replaceAssetHistory(history, assetId: asset.id)
                } catch {
                    if !hasCachedHistory && history.isEmpty {
                        actionError = UserFacingError.message(
                            error,
                            fallback: "Couldn't load this asset's history."
                        )
                    }
                }
            }
        } catch {
            if currentLookup == nil {
                phase = .failed(UserFacingError.message(error, fallback: "Couldn't load this asset. Try again."))
            }
        }
    }

    func checkOut(
        to member: Member,
        location: String?,
        convex: ConvexService,
        sync: SyncEnvironment
    ) async {
        guard case .loaded(let asset, _) = phase else { return }
        await enqueueWrite(
            kind: .assetCheckOut,
            title: "Check out \(asset.name) to \(member.fullName)",
            payload: CheckOutPayload(
                assetId: asset.id,
                custodianMemberId: member.id,
                location: location,
                dueBack: nil,
                notes: nil
            ),
            convex: convex,
            sync: sync
        ) {
            let updated = self.updated(
                asset,
                status: .checkedOut,
                custodianMemberId: member.id,
                location: location ?? asset.location ?? self.defaultAddress,
                dueBack: nil
            )
            self.phase = .loaded(updated, custodian: member)
            self.cacheCurrentLookup(asset: updated, custodian: member, sync: sync)
            self.cacheCheckedOutAsset(asset: updated, custodian: member, sync: sync)
        }
    }

    func checkIn(location: String?, convex: ConvexService, sync: SyncEnvironment) async {
        guard case .loaded(let asset, _) = phase else { return }
        await enqueueWrite(
            kind: .assetCheckIn,
            title: "Check in \(asset.name)",
            payload: CheckInPayload(
                assetId: asset.id,
                location: location,
                notes: nil
            ),
            convex: convex,
            sync: sync
        ) {
            let updated = self.updated(
                asset,
                status: .available,
                custodianMemberId: nil,
                location: location ?? asset.location ?? self.defaultAddress,
                dueBack: nil
            )
            self.phase = .loaded(updated, custodian: nil)
            self.cacheCurrentLookup(asset: updated, custodian: nil, sync: sync)
            self.removeCheckedOutAsset(assetId: updated.id, sync: sync)
        }
    }

    func applyLocalAsset(_ asset: Asset, sync: SyncEnvironment) {
        let custodian = currentLookup?.custodian
        phase = .loaded(asset, custodian: custodian)
        cacheCurrentLookup(asset: asset, custodian: custodian, sync: sync)
        upsertAssetListCache(asset: asset, custodian: custodian, sync: sync)
    }

    func retire(
        asset: Asset,
        notes: String?,
        convex: ConvexService,
        sync: SyncEnvironment
    ) async {
        await enqueueWrite(
            kind: .assetRetire,
            title: "Retire \(asset.name)",
            payload: AssetLifecyclePayload(assetId: asset.id, notes: notes),
            convex: convex,
            sync: sync
        ) {
            let updated = self.updated(
                asset,
                status: .retired,
                custodianMemberId: nil,
                location: asset.location,
                dueBack: nil
            )
            self.phase = .loaded(updated, custodian: nil)
            self.cacheCurrentLookup(asset: updated, custodian: nil, sync: sync)
            self.upsertAssetListCache(asset: updated, custodian: nil, sync: sync)
            self.removeCheckedOutAsset(assetId: updated.id, sync: sync)
        }
    }

    func delete(asset: Asset, convex: ConvexService, sync: SyncEnvironment) async {
        guard let tagId = currentTagId else { return }
        isBusy = true
        actionError = nil
        defer { isBusy = false }
        do {
            let op = try sync.enqueue(
                kind: .assetDelete,
                title: "Delete \(asset.name)",
                payload: AssetDeletePayload(assetId: asset.id)
            )
            phase = .notFound
            removeAssetFromCaches(assetId: asset.id, sync: sync)
            if let lookup = currentLookup {
                let cleared = TagLookupResult(
                    found: false,
                    asset: nil,
                    custodian: nil,
                    tag: lookup.tag
                )
                currentLookup = cleared
                try? sync.store?.replaceTagLookup(cleared, tagId: tagId)
            }
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load(tagId: tagId, convex: convex, sync: sync)
            }
        } catch {
            actionError = UserFacingError.message(error, fallback: "Couldn't queue asset deletion.")
        }
    }

    func logScan(convex: ConvexService, sync: SyncEnvironment) async {
        guard case .loaded(let asset, _) = phase else { return }
        let location = await LocationService.shared.currentLocation()
        let payload = ScanPayload(
            assetId: asset.id,
            latitude: location?.coordinate.latitude,
            longitude: location?.coordinate.longitude,
            accuracy: location?.horizontalAccuracy
        )
        do {
            try sync.enqueue(
                kind: .assetScan,
                title: "Scan \(asset.name)",
                payload: payload
            )
            await sync.coordinator?.syncIfOnline()
        } catch {
            actionError = UserFacingError.message(error, fallback: "Couldn't queue scan.")
        }
    }

    private func enqueueWrite<P: Encodable>(
        kind: SyncOperationKind,
        title: String,
        payload: P,
        convex: ConvexService,
        sync: SyncEnvironment,
        optimistic: () -> Void
    ) async {
        guard let tagId = currentTagId else { return }
        isBusy = true
        actionError = nil
        defer { isBusy = false }
        do {
            let op = try sync.enqueue(kind: kind, title: title, payload: payload)
            optimistic()
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load(tagId: tagId, convex: convex, sync: sync)
            }
        } catch {
            actionError = UserFacingError.message(error, fallback: "Couldn't queue that asset action. Try again.")
        }
    }

    private func apply(_ lookup: TagLookupResult) {
        currentLookup = lookup
        if lookup.found, let asset = lookup.asset {
            phase = .loaded(asset, custodian: lookup.custodian)
        } else {
            phase = .notFound
        }
    }

    private func cacheCurrentLookup(asset: Asset, custodian: Member?, sync: SyncEnvironment) {
        guard let tagId = currentTagId else { return }
        let lookup = TagLookupResult(
            found: true,
            asset: asset,
            custodian: custodian,
            tag: currentLookup?.tag
        )
        currentLookup = lookup
        try? sync.store?.replaceTagLookup(lookup, tagId: tagId)
    }

    private func cacheCheckedOutAsset(asset: Asset, custodian: Member, sync: SyncEnvironment) {
        var rows = (try? sync.store?.cachedCheckedOutAssets()) ?? []
        rows.removeAll { $0.id == asset.id }
        rows.append(
            AssetSummary(
                id: asset.id,
                name: asset.name,
                category: asset.category,
                status: asset.status,
                custodianName: custodian.fullName,
                location: asset.location,
                dueBack: asset.dueBack,
                qrTagId: asset.qrTagId,
                nfcTagId: asset.nfcTagId,
                serialNumber: asset.serialNumber
            )
        )
        rows.sort { $0.name < $1.name }
        try? sync.store?.replaceCheckedOutAssets(rows)
    }

    private func upsertAssetListCache(asset: Asset, custodian: Member?, sync: SyncEnvironment) {
        var rows = (try? sync.store?.cachedAssets()) ?? []
        rows.removeAll { $0.id == asset.id }
        rows.append(
            AssetSummary(
                id: asset.id,
                name: asset.name,
                category: asset.category,
                status: asset.status,
                custodianName: custodian?.fullName,
                location: asset.location,
                dueBack: asset.dueBack,
                qrTagId: asset.qrTagId,
                nfcTagId: asset.nfcTagId,
                serialNumber: asset.serialNumber
            )
        )
        rows.sort { $0.name < $1.name }
        try? sync.store?.replaceAssets(rows)

        if (asset.status == .checkedOut || asset.status == .inUse), let custodian {
            cacheCheckedOutAsset(asset: asset, custodian: custodian, sync: sync)
        } else {
            removeCheckedOutAsset(assetId: asset.id, sync: sync)
        }
    }

    private func removeCheckedOutAsset(assetId: String, sync: SyncEnvironment) {
        var rows = (try? sync.store?.cachedCheckedOutAssets()) ?? []
        rows.removeAll { $0.id == assetId }
        try? sync.store?.replaceCheckedOutAssets(rows)
    }

    private func removeAssetFromCaches(assetId: String, sync: SyncEnvironment) {
        var rows = (try? sync.store?.cachedAssets()) ?? []
        rows.removeAll { $0.id == assetId }
        try? sync.store?.replaceAssets(rows)
        removeCheckedOutAsset(assetId: assetId, sync: sync)
    }

    private func updated(
        _ asset: Asset,
        status: AssetStatus,
        custodianMemberId: String?,
        location: String?,
        dueBack: Double?
    ) -> Asset {
        Asset(
            id: asset.id,
            name: asset.name,
            category: asset.category,
            description: asset.description,
            serialNumber: asset.serialNumber,
            condition: asset.condition,
            status: status,
            custodianMemberId: custodianMemberId,
            location: location,
            notes: asset.notes,
            qrTagId: asset.qrTagId,
            nfcTagId: asset.nfcTagId,
            dueBack: dueBack
        )
    }

}

private struct AssetEditorSheet: View {
    let asset: Asset
    let onSaved: (_ saved: Asset, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var categories: [TaxonomyOption] = []
    @State private var conditions: [TaxonomyOption] = []
    @State private var name: String
    @State private var category: String
    @State private var description: String
    @State private var serialNumber: String
    @State private var condition: String
    @State private var location: String
    @State private var notes: String
    @State private var loadingOptions = false
    @State private var saving = false
    @State private var error: String?

    init(
        asset: Asset,
        onSaved: @escaping (_ saved: Asset, _ shouldReload: Bool) -> Void
    ) {
        self.asset = asset
        self.onSaved = onSaved
        self._name = State(initialValue: asset.name)
        self._category = State(initialValue: asset.category)
        self._description = State(initialValue: asset.description ?? "")
        self._serialNumber = State(initialValue: asset.serialNumber ?? "")
        self._condition = State(initialValue: asset.condition)
        self._location = State(initialValue: asset.location ?? "")
        self._notes = State(initialValue: asset.notes ?? "")
    }

    private var categoryOptions: [(key: String, label: String)] {
        mergedOptions(
            rows: categories,
            fallback: defaultAssetCategories,
            selectedKey: category
        )
    }

    private var conditionOptions: [(key: String, label: String)] {
        mergedOptions(
            rows: conditions,
            fallback: defaultAssetConditions,
            selectedKey: condition
        )
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
            .navigationTitle("Edit asset")
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
        }
        if hasCachedConditions {
            conditions = (try? sync.store?.cachedAssetConditions()) ?? []
        }
        loadingOptions = !(hasCachedCategories && hasCachedConditions)
        defer { loadingOptions = false }
        do {
            async let categoryTask = convex.listAssetCategories()
            async let conditionTask = convex.listAssetConditions()
            let (categoryRows, conditionRows) = try await (categoryTask, conditionTask)
            categories = categoryRows
            conditions = conditionRows
            try? sync.store?.replaceAssetCategories(categoryRows)
            try? sync.store?.replaceAssetConditions(conditionRows)
        } catch {
            // Cached/default taxonomy values keep editing available offline.
        }
    }

    private func save() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            error = "Name is required."
            return
        }
        guard !category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = "Category is required."
            return
        }
        guard !condition.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = "Condition is required."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        let payload = AssetMutationPayload(
            name: trimmedName,
            category: category,
            description: cleaned(description),
            serialNumber: cleaned(serialNumber),
            condition: condition,
            location: cleaned(location),
            notes: cleaned(notes)
        )

        do {
            let op = try sync.enqueue(
                kind: .assetUpdate,
                title: "Update \(trimmedName)",
                payload: AssetUpdatePayload(assetId: asset.id, asset: payload)
            )
            let saved = Asset(
                id: asset.id,
                name: payload.name,
                category: payload.category,
                description: payload.description,
                serialNumber: payload.serialNumber,
                condition: payload.condition,
                status: asset.status,
                custodianMemberId: asset.custodianMemberId,
                location: payload.location,
                notes: payload.notes,
                qrTagId: asset.qrTagId,
                nfcTagId: asset.nfcTagId,
                dueBack: asset.dueBack
            )
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue asset update.")
        }
    }

    private func mergedOptions(
        rows: [TaxonomyOption],
        fallback: [(key: String, label: String)],
        selectedKey: String
    ) -> [(key: String, label: String)] {
        var options = rows.isEmpty ? fallback : rows.map { ($0.key, $0.label) }
        if !selectedKey.isEmpty && !options.contains(where: { $0.key == selectedKey }) {
            options.insert((selectedKey, selectedKey.taxonomyDisplayName), at: 0)
        }
        return options
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct AssetRetireSheet: View {
    let asset: Asset
    let onRetire: (_ notes: String?) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var notes = ""
    @State private var retiring = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Retire asset") {
                    LabeledContent("Asset", value: asset.name)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("Retire asset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(retiring ? "Retiring..." : "Retire", role: .destructive) {
                        Task { await retire() }
                    }
                    .disabled(retiring)
                }
            }
        }
    }

    private func retire() async {
        retiring = true
        defer { retiring = false }
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        await onRetire(trimmed.isEmpty ? nil : trimmed)
        dismiss()
    }
}

private let defaultAssetCategories: [(key: String, label: String)] = [
    ("equipment", "Equipment"),
    ("apparel", "Apparel"),
    ("tool", "Tool"),
    ("electronics", "Electronics"),
    ("safety_equipment", "Safety equipment"),
    ("vehicle", "Vehicle"),
    ("key", "Key"),
    ("other", "Other"),
]

private let defaultAssetConditions: [(key: String, label: String)] = [
    ("new", "New"),
    ("good", "Good"),
    ("fair", "Fair"),
    ("poor", "Poor"),
    ("damaged", "Damaged"),
]

private struct AssetHistoryEntryRow: View {
    let entry: AssetHistoryEntry

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.action.taxonomyDisplayName)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Spacer()
                Text(entry.performedDate.formatted(date: .abbreviated, time: .shortened))
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
            }

            Text("By \(entry.performerName)")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkSoft)

            if let details {
                Text(details)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
            }

            if let notes = entry.notes, !notes.isEmpty {
                Text(notes)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
            }
        }
        .padding(.vertical, GHSpacing.xs)
    }

    private var details: String? {
        var parts: [String] = []
        if let fromStatus = entry.fromStatus, let toStatus = entry.toStatus {
            parts.append("\(fromStatus.taxonomyDisplayName) → \(toStatus.taxonomyDisplayName)")
        }
        if entry.fromCustodianName != nil || entry.toCustodianName != nil {
            parts.append("\(entry.fromCustodianName ?? "Nobody") → \(entry.toCustodianName ?? "Nobody")")
        }
        if entry.fromLocation != nil || entry.toLocation != nil {
            parts.append("\(entry.fromLocation ?? "No location") → \(entry.toLocation ?? "No location")")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
