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

    var body: some View {
        content
            .navigationTitle("Asset")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await model.load(tagId: tagId, convex: convex)
                if case .loaded = model.phase {
                    // Background: log a sighting with geo coords.
                    Task { await model.logScan(convex: convex, sync: sync) }
                }
            }
            .sheet(isPresented: $showCustodianPicker) {
                MemberPickerView { member in
                    showCustodianPicker = false
                    Task { await model.checkOut(to: member, convex: convex, sync: sync) }
                }
            }
            .sheet(isPresented: $showAssetPicker) {
                AssetPickerSheet(tagId: tagId) { _ in
                    showAssetPicker = false
                    Task { await model.load(tagId: tagId, convex: convex) }
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
                retry: { await model.load(tagId: tagId, convex: convex) }
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
                        Text(asset.category.displayName).foregroundStyle(.secondary)
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
                LabeledContent("Condition", value: asset.condition.rawValue.capitalized)
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
                Task { await model.checkIn(convex: convex, sync: sync) }
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

    private var currentTagId: String?

    func load(tagId: String, convex: ConvexService) async {
        currentTagId = tagId
        phase = .loading
        do {
            let result = try await convex.lookupTag(tagId)
            if result.found, let asset = result.asset {
                phase = .loaded(asset, custodian: result.custodian)
            } else {
                phase = .notFound
            }
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func checkOut(to member: Member, convex: ConvexService, sync: SyncEnvironment) async {
        guard case .loaded(let asset, _) = phase else { return }
        await enqueueWrite(
            kind: .assetCheckOut,
            title: "Check out \(asset.name) to \(member.fullName)",
            payload: CheckOutPayload(
                assetId: asset.id,
                custodianMemberId: member.id,
                location: nil,
                dueBack: nil,
                notes: nil
            ),
            convex: convex,
            sync: sync
        )
    }

    func checkIn(convex: ConvexService, sync: SyncEnvironment) async {
        guard case .loaded(let asset, _) = phase else { return }
        await enqueueWrite(
            kind: .assetCheckIn,
            title: "Check in \(asset.name)",
            payload: CheckInPayload(
                assetId: asset.id,
                location: nil,
                notes: nil
            ),
            convex: convex,
            sync: sync
        )
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
        if let store = sync.store,
           let data = try? JSONEncoder().encode(payload) {
            try? store.enqueue(
                kind: .assetScan,
                title: "Scan \(asset.name)",
                payload: data
            )
            await sync.coordinator?.syncIfOnline()
        }
    }

    private func enqueueWrite<P: Encodable>(
        kind: SyncOperationKind,
        title: String,
        payload: P,
        convex: ConvexService,
        sync: SyncEnvironment
    ) async {
        guard let tagId = currentTagId else { return }
        isBusy = true
        actionError = nil
        defer { isBusy = false }
        do {
            if let store = sync.store {
                let data = try JSONEncoder().encode(payload)
                try store.enqueue(kind: kind, title: title, payload: data)
                await sync.coordinator?.syncIfOnline()
            }
            // Re-load from server so the view reflects new state. If
            // we're offline this fails silently and we'll show the
            // previous detail until reconnect.
            await load(tagId: tagId, convex: convex)
        } catch {
            actionError = error.localizedDescription
        }
    }

}
