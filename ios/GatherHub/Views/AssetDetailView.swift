import SwiftUI

/// Shows a looked-up asset (`tags:lookupAuthed`) and offers Check Out / Check In.
///
/// MVVM-lite: a small `@StateObject` view model owns the async loading and the
/// check-in/out mutations so the view stays declarative.
struct AssetDetailView: View {
    let tagId: String

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @StateObject private var model = AssetDetailViewModel()
    @State private var showCustodianPicker = false
    @State private var showAssetPicker = false
    @State private var showCheckOutLocation = false
    @State private var showCheckInLocation = false
    @State private var pendingCheckOutMember: Member?

    var body: some View {
        content
            .navigationTitle("Asset")
            .navigationBarTitleDisplayMode(.inline)
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

            Section {
                actions(for: asset)
            } footer: {
                if model.isBusy {
                    ProgressView()
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
                do {
                    history = try await convex.assetHistory(assetId: asset.id)
                    try? sync.store?.replaceAssetHistory(history, assetId: asset.id)
                } catch {
                    if history.isEmpty {
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

    private func removeCheckedOutAsset(assetId: String, sync: SyncEnvironment) {
        var rows = (try? sync.store?.cachedCheckedOutAssets()) ?? []
        rows.removeAll { $0.id == assetId }
        try? sync.store?.replaceCheckedOutAssets(rows)
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
