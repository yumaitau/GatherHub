import SwiftUI

/// The driver's waste-removal loads (`waste:listLoads`), grouped by status.
/// Tapping a load opens `WasteLoadDetailView` with stage-appropriate actions.
struct WasteLoadsView: View {
    let context: CurrentContext

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @StateObject private var model = WasteLoadsViewModel()

    var body: some View {
        NavigationStack {
            Group {
                switch model.phase {
                case .loading:
                    ProgressView("Loading loads…")
                case .failed(let message):
                    OfflineStateView(
                        title: "Couldn't load loads",
                        message: message,
                        retry: { await model.load(convex: convex) }
                    )
                case .loaded where model.loads.isEmpty:
                    EmptyStateView(
                        title: "No loads",
                        systemImage: "arrow.3.trianglepath",
                        message: "Scheduled waste loads assigned to you will appear here."
                    )
                case .loaded:
                    list
                }
            }
            .navigationTitle("Loads")
            .overlay(alignment: .top) { ErrorBanner(message: $model.actionError) }
            .task { await model.load(convex: convex) }
            .refreshable { await model.load(convex: convex) }
        }
    }

    private var list: some View {
        List {
            ForEach(model.sections, id: \.status) { section in
                Section(section.status.displayName) {
                    ForEach(section.loads) { load in
                        NavigationLink {
                            WasteLoadDetailView(load: load)
                        } label: {
                            row(for: load)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func row(for load: WasteLoadSummary) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(load.title)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Spacer()
                if load.flaggedDiscrepancy {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Color.gh.warning)
                }
            }
            if let route = load.routeSummary {
                Text(route)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
            }
            if let date = load.scheduledDate {
                Label {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                } icon: {
                    Image(systemName: "clock")
                }
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
            }
        }
        .padding(.vertical, 2)
    }
}

/// View model for the loads list. There is no offline cache table for waste
/// loads, so this loads straight from Convex (the captured pickup/arrival
/// events still queue offline via the sync queue).
@MainActor
final class WasteLoadsViewModel: ObservableObject {
    enum Phase: Equatable { case loading, loaded, failed(String) }

    struct StatusSection: Equatable {
        let status: WasteLoadStatus
        let loads: [WasteLoadSummary]
    }

    @Published var phase: Phase = .loading
    @Published var loads: [WasteLoadSummary] = []
    @Published var actionError: String?

    /// Loads grouped into sections in a sensible driver order (open work first).
    var sections: [StatusSection] {
        WasteLoadStatus.allCases.compactMap { status in
            let matching = loads.filter { $0.status == status }
            return matching.isEmpty ? nil : StatusSection(status: status, loads: matching)
        }
    }

    func load(convex: ConvexService) async {
        if loads.isEmpty { phase = .loading }
        do {
            let rows = try await convex.listWasteLoads()
            self.loads = rows.sorted { lhs, rhs in
                (lhs.scheduledFor ?? .greatestFiniteMagnitude)
                    < (rhs.scheduledFor ?? .greatestFiniteMagnitude)
            }
            phase = .loaded
        } catch {
            if loads.isEmpty {
                phase = .failed(UserFacingError.message(error, fallback: "Couldn't load loads. Try again."))
            } else {
                phase = .loaded
                actionError = UserFacingError.message(error, fallback: "Couldn't refresh loads.")
            }
        }
    }
}
