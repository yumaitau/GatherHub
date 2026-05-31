import SwiftUI

/// Player roster with computed grade. Read-only on phone for now —
/// scoring a player still happens on web. Useful to scan grades at
/// training without a laptop.
struct GradingListView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [PlayerRosterRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var query = ""
    @State private var division: String = "All"
    @State private var scoredOnly = false
    @State private var unscoredOnly = false

    private var divisionOptions: [String] {
        let set = Set(rows.compactMap { $0.division?.name }).sorted()
        return ["All"] + set + ["Unassigned"]
    }

    private var activeFilterCount: Int {
        (division != "All" ? 1 : 0)
            + (scoredOnly ? 1 : 0)
            + (unscoredOnly ? 1 : 0)
    }

    private var filtered: [PlayerRosterRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        var data = rows
        if division == "Unassigned" {
            data = data.filter { $0.division == nil }
        } else if division != "All" {
            data = data.filter { $0.division?.name == division }
        }
        if scoredOnly { data = data.filter { $0.scoredCount > 0 } }
        if unscoredOnly { data = data.filter { $0.scoredCount == 0 } }
        guard !q.isEmpty else { return data }
        return data.filter {
            $0.name.lowercased().contains(q)
                || ($0.division?.name ?? "").lowercased().contains(q)
        }
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
            } else if rows.isEmpty {
                EmptyStateView(
                    title: "No players to grade",
                    systemImage: "gauge.with.dots.needle.67percent",
                    message: "Active members will appear here. Score them on the web admin."
                )
            } else {
                List(filtered) { row in
                    NavigationLink {
                        PlayerGradingView(memberId: row.memberId, memberName: row.name)
                    } label: {
                        GradingRow(row: row)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Grading")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Division", selection: $division) {
                        ForEach(divisionOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle("Scored only", isOn: $scoredOnly)
                    Toggle("Unscored only", isOn: $unscoredOnly)
                } label: {
                    Image(systemName: activeFilterCount > 0
                          ? "line.3.horizontal.decrease.circle.fill"
                          : "line.3.horizontal.decrease.circle")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search player or division"
        )
    }

    private func load() async {
        let hasCachedPlayerRoster = (try? sync.store?.hasCachedPlayerRoster()) ?? false
        if hasCachedPlayerRoster {
            rows = (try? sync.store?.cachedPlayerRoster()) ?? []
        }
        loading = !hasCachedPlayerRoster && rows.isEmpty
        error = nil
        defer { loading = false }
        do {
            let fresh = try await convex.listPlayerRoster()
            rows = fresh
            try? sync.store?.replacePlayerRoster(fresh)
        } catch let err {
            if !hasCachedPlayerRoster && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load grading.")
            }
        }
    }
}

private struct GradingRow: View {
    let row: PlayerRosterRow

    var body: some View {
        HStack(spacing: GHSpacing.lg) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                HStack(spacing: GHSpacing.sm) {
                    if let division = row.division {
                        Text(division.name)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    } else {
                        Text("Unassigned")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                    Text("·")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                    Text("\(row.scoredCount) / \(row.totalSkills) skills")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            Spacer()
            gradePill
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var gradePill: some View {
        if row.scoredCount == 0 {
            GHBadge(text: "—", variant: .outline)
        } else {
            Text(row.grade.formatted(.number.precision(.fractionLength(1))))
                .font(.gh.bodyStrong)
                .foregroundStyle(Color.gh.inkStrong)
                .monospacedDigit()
                .padding(.horizontal, GHSpacing.md)
                .padding(.vertical, 2)
                .background(Color.gh.accentWash)
                .clipShape(Capsule())
        }
    }
}
