import SwiftUI

struct SportFixturesListView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment

    @State private var fixtures: [SportFixture] = []
    @State private var loading = true
    @State private var error: String?
    @State private var search = ""

    private var filteredFixtures: [SportFixture] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let rows = fixtures.sorted { $0.startTime < $1.startTime }
        guard !query.isEmpty else { return rows }
        return rows.filter { fixture in
            [
                fixture.title,
                fixture.teamSummary,
                fixture.venueSummary,
                fixture.competitionName,
                fixture.divisionName,
                fixture.roundName,
                fixture.status.displayName,
            ]
            .compactMap { $0?.lowercased() }
            .contains { $0.contains(query) }
        }
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load fixtures",
                    message: error,
                    retry: load
                )
            } else if fixtures.isEmpty {
                EmptyStateView(
                    title: "No fixtures",
                    systemImage: "calendar",
                    message: "Fixtures will appear here."
                )
            } else {
                List(filteredFixtures) { fixture in
                    SportFixtureRowView(fixture: fixture)
                        .listRowSeparator(.visible)
                }
                .listStyle(.plain)
                .searchable(text: $search, prompt: "Search fixtures")
            }
        }
        .navigationTitle("Fixtures")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        let hasCachedRows = (try? sync.store?.hasCachedSportFixtures()) ?? false
        if hasCachedRows {
            fixtures = (try? sync.store?.cachedSportFixtures()) ?? []
            loading = false
        } else if fixtures.isEmpty {
            loading = true
        }
        error = nil

        do {
            let freshRows = try await convex.listSportFixtures(upcomingOnly: false)
            fixtures = freshRows
            try? sync.store?.replaceSportFixtures(freshRows)
        } catch let err {
            if !hasCachedRows && fixtures.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load fixtures.")
            }
        }
        loading = false
    }
}

private struct SportFixtureRowView: View {
    let fixture: SportFixture

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack(alignment: .top, spacing: GHSpacing.md) {
                Image(systemName: "calendar")
                    .foregroundStyle(Color.gh.inkSoft)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 3) {
                    Text(fixture.title)
                        .font(.gh.bodyStrong)
                        .foregroundStyle(Color.gh.inkStrong)
                    if !fixture.teamSummary.isEmpty {
                        Text(fixture.teamSummary)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                    Text(fixture.startDate.formatted(date: .abbreviated, time: .shortened))
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                    if let venue = fixture.venueSummary {
                        Text(venue)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                }
                Spacer(minLength: GHSpacing.md)
                GHBadge(text: fixture.status.displayName, variant: badgeVariant)
            }
            if let meta = fixtureMeta {
                Text(meta)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
                    .padding(.leading, 34)
            }
        }
        .padding(.vertical, GHSpacing.xs)
    }

    private var fixtureMeta: String? {
        let values = [fixture.competitionName, fixture.divisionName, fixture.roundName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return values.isEmpty ? nil : values.joined(separator: " / ")
    }

    private var badgeVariant: GHBadge.Variant {
        switch fixture.status {
        case .scheduled: return .info
        case .postponed, .forfeit: return .warning
        case .cancelled: return .danger
        case .completed: return .success
        }
    }
}
