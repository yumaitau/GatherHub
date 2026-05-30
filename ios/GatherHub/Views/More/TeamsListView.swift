import SwiftUI

/// Team roster index. Shows all active teams with player + staff
/// counts. Tap to drill into the team detail (player list).
struct TeamsListView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var teams: [Team] = []
    @State private var loading = true
    @State private var error: String?
    @State private var query = ""
    @State private var includeInactive = false
    @State private var ageGroup: String = "All"

    private var ageGroups: [String] {
        let set = Set(teams.compactMap { $0.ageGroup }).sorted()
        return ["All"] + set
    }

    private var filtered: [Team] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        var rows = teams
        if !includeInactive { rows = rows.filter { $0.isActive } }
        if ageGroup != "All" { rows = rows.filter { $0.ageGroup == ageGroup } }
        guard !q.isEmpty else { return rows }
        return rows.filter {
            $0.name.lowercased().contains(q)
                || ($0.ageGroup ?? "").lowercased().contains(q)
        }
    }

    private var activeFilterCount: Int {
        (includeInactive ? 1 : 0) + (ageGroup != "All" ? 1 : 0)
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading teams…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load teams",
                    message: error,
                    retry: load
                )
            } else if teams.isEmpty {
                EmptyStateView(
                    title: "No teams yet",
                    systemImage: "shield.lefthalf.filled",
                    message: "Create a team on the web admin to organise members."
                )
            } else {
                List(filtered) { team in
                    NavigationLink {
                        TeamDetailView(team: team)
                    } label: {
                        TeamRow(team: team)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Teams")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Toggle("Show inactive", isOn: $includeInactive)
                    Picker("Age group", selection: $ageGroup) {
                        ForEach(ageGroups, id: \.self) { Text($0).tag($0) }
                    }
                } label: {
                    Image(systemName: activeFilterCount > 0
                          ? "line.3.horizontal.decrease.circle.fill"
                          : "line.3.horizontal.decrease.circle")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .searchable(text: $query, prompt: "Search team or age group")
    }

    private func load() async {
        if let cached = try? sync.store?.cachedTeams(), !cached.isEmpty {
            teams = cached
            loading = false
        } else if teams.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listTeams()
            teams = fresh
            try? sync.store?.replaceTeams(fresh)
        } catch let err {
            if teams.isEmpty { error = err.localizedDescription }
        }
        loading = false
    }
}

private struct TeamRow: View {
    let team: Team

    var body: some View {
        HStack(spacing: GHSpacing.lg) {
            Image(systemName: "shield.lefthalf.filled")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Color.gh.accent)
                .frame(width: 40, height: 40)
                .background(Color.gh.accentWash)
                .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius))
            VStack(alignment: .leading, spacing: 2) {
                Text(team.name)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                HStack(spacing: GHSpacing.sm) {
                    if let ageGroup = team.ageGroup {
                        Text(ageGroup)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                    Text("\(team.playerCount) players")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            Spacer()
            if !team.isActive {
                GHBadge(text: "Inactive", variant: .muted)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Lightweight team detail — name, age group, season, counts. Roster
/// expansion lands in a follow-up slice once `teams:get` is exposed
/// here without overlapping the member roster surface.
struct TeamDetailView: View {
    let team: Team

    var body: some View {
        List {
            Section("Team") {
                LabeledContent("Name", value: team.name)
                if let ageGroup = team.ageGroup {
                    LabeledContent("Age group", value: ageGroup)
                }
                if let season = team.season {
                    LabeledContent("Season", value: season)
                }
                LabeledContent("Status", value: team.isActive ? "Active" : "Inactive")
            }
            Section("Squad") {
                LabeledContent("Players", value: "\(team.playerCount)")
                LabeledContent("Staff", value: "\(team.staffCount)")
            }
        }
        .navigationTitle(team.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
