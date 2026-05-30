import SwiftUI

/// Match-day "is this player registered + paid + WWVP'd?" lookup.
/// Mirrors the web Player Registrations table but compressed to a
/// phone-friendly row + filter chips.
struct SoccerRegistrationsView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [PlayerListingRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var query = ""
    @State private var filter: StatusFilter = .all
    @State private var team: String = "All"
    @State private var division: String = "All"
    @State private var paymentPlanOnly = false
    @State private var editingRow: PlayerListingRow?

    enum StatusFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case unregistered = "No rego"
        case pending = "Pending"
        case active = "Active"
        case unpaid = "Unpaid"
        case plan = "Plan"
        var id: String { rawValue }
    }

    private var teamOptions: [String] {
        let set = Set(rows.compactMap { $0.teamName }).sorted()
        return ["All"] + set
    }

    private var divisionOptions: [String] {
        let set = Set(rows.compactMap { $0.divisionName }).sorted()
        return ["All"] + set
    }

    private var activeFilterCount: Int {
        (team != "All" ? 1 : 0)
            + (division != "All" ? 1 : 0)
            + (paymentPlanOnly ? 1 : 0)
    }

    private var filtered: [PlayerListingRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        var data = rows
        switch filter {
        case .all: break
        case .unregistered: data = data.filter { !$0.hasRegistration }
        case .pending: data = data.filter { $0.hasRegistration && !$0.registered }
        case .active: data = data.filter { $0.registered && $0.paid }
        case .unpaid: data = data.filter { $0.registered && !$0.paid && !$0.paymentPlan }
        case .plan: data = data.filter { $0.paymentPlan }
        }
        if team != "All" { data = data.filter { $0.teamName == team } }
        if division != "All" { data = data.filter { $0.divisionName == division } }
        if paymentPlanOnly { data = data.filter { $0.paymentPlan } }
        if !q.isEmpty {
            data = data.filter {
                $0.name.lowercased().contains(q)
                    || ($0.email ?? "").lowercased().contains(q)
                    || ($0.ffaNumber ?? "").lowercased().contains(q)
                    || ($0.teamName ?? "").lowercased().contains(q)
            }
        }
        return data
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load",
                    message: error,
                    retry: load
                )
            } else {
                content
            }
        }
        .navigationTitle("Registrations")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Team", selection: $team) {
                        ForEach(teamOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Division", selection: $division) {
                        ForEach(divisionOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle("Payment plan only", isOn: $paymentPlanOnly)
                } label: {
                    Image(systemName: activeFilterCount > 0
                          ? "line.3.horizontal.decrease.circle.fill"
                          : "line.3.horizontal.decrease.circle")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .searchable(text: $query, prompt: "Search player, FFA, team")
    }

    private var content: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: GHSpacing.sm) {
                    ForEach(StatusFilter.allCases) { f in
                        Button {
                            filter = f
                        } label: {
                            Text(f.rawValue)
                        }
                        .buttonStyle(.gh(filter == f ? .primary : .outline, size: .sm))
                    }
                }
                .padding(.horizontal, GHSpacing.pageInset)
                .padding(.vertical, GHSpacing.md)
            }
            .background(Color.gh.surface)
            Divider()
            List(filtered) { row in
                Button {
                    editingRow = row
                } label: {
                    RegistrationRow(row: row)
                }
                .buttonStyle(.plain)
            }
            .listStyle(.plain)
        }
        .sheet(item: $editingRow) { row in
            PlayerAssignmentSheet(row: row) {
                Task { await load() }
            }
        }
    }

    private func load() async {
        if let cached = try? sync.store?.cachedPlayerListings(), !cached.isEmpty {
            rows = cached
            loading = false
        } else if rows.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listPlayerRegistrations()
            rows = fresh
            try? sync.store?.replacePlayerListings(fresh)
        } catch let err {
            if rows.isEmpty { error = err.localizedDescription }
        }
        loading = false
    }
}

private struct RegistrationRow: View {
    let row: PlayerListingRow

    var body: some View {
        HStack(alignment: .top, spacing: GHSpacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                HStack(spacing: GHSpacing.sm) {
                    if let team = row.teamName {
                        Text(team)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                    if let division = row.divisionName {
                        Text("·")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                        Text(division)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                }
                if let ffa = row.ffaNumber {
                    Text("FFA \(ffa)")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                        .monospaced()
                }
            }
            Spacer()
            statusBadge
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if !row.hasRegistration {
            GHBadge(text: "No rego", variant: .outline)
        } else if row.registered && row.paid {
            GHBadge(text: "Active", variant: .success)
        } else if row.registered && row.paymentPlan {
            GHBadge(text: "Plan", variant: .warning)
        } else if row.registered {
            GHBadge(text: "Unpaid", variant: .danger)
        } else {
            GHBadge(text: "Pending", variant: .muted)
        }
    }
}
