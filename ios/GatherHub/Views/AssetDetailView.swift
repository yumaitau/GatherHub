import SwiftUI

/// Shows a looked-up asset (`tags:lookupAuthed`) and offers Check Out / Check In.
///
/// MVVM-lite: a small `@StateObject` view model owns the async loading and the
/// check-in/out mutations so the view stays declarative.
struct AssetDetailView: View {
    let tagId: String

    @EnvironmentObject private var convex: ConvexService
    @StateObject private var model = AssetDetailViewModel()
    @State private var showCustodianPicker = false

    var body: some View {
        content
            .navigationTitle("Asset")
            .navigationBarTitleDisplayMode(.inline)
            .task { await model.load(tagId: tagId, convex: convex) }
            .sheet(isPresented: $showCustodianPicker) {
                MemberPickerView { member in
                    showCustodianPicker = false
                    Task { await model.checkOut(to: member, convex: convex) }
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            ProgressView("Looking up tag…")
        case .notFound:
            EmptyStateView(
                title: "Tag not found",
                systemImage: "questionmark.circle",
                message: "This tag isn't registered to your club, or it's inactive."
            )
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
                Task { await model.checkIn(convex: convex) }
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

    func checkOut(to member: Member, convex: ConvexService) async {
        guard case .loaded(let asset, _) = phase else { return }
        await run {
            try await convex.checkOut(assetId: asset.id, custodianMemberId: member.id)
        } convex: { convex }
    }

    func checkIn(convex: ConvexService) async {
        guard case .loaded(let asset, _) = phase else { return }
        await run {
            try await convex.checkIn(assetId: asset.id)
        } convex: { convex }
    }

    /// Run a mutation, then reload so the UI reflects the new status/custodian.
    private func run(
        _ work: () async throws -> Void,
        convex: () -> ConvexService
    ) async {
        guard let tagId = currentTagId else { return }
        isBusy = true
        actionError = nil
        defer { isBusy = false }
        do {
            try await work()
            await load(tagId: tagId, convex: convex())
        } catch {
            actionError = error.localizedDescription
        }
    }
}
