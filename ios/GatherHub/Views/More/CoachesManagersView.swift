import SwiftUI

/// Sideline-friendly view: every coach / manager with WWVP status.
/// Designed for a one-glance "is this person cleared?" check.
struct CoachesManagersView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [CoachManagerRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var query = ""
    @State private var roleFilter: RoleFilter = .all
    @State private var wwvpFilter: WwvpFilter = .all

    enum RoleFilter: String, CaseIterable, Identifiable {
        case all = "All roles"
        case coach = "Coaches"
        case manager = "Managers"
        var id: String { rawValue }
    }

    enum WwvpFilter: String, CaseIterable, Identifiable {
        case all = "All WWVP"
        case approved = "Approved"
        case sighted = "Sighted"
        case pending = "Pending"
        case notProvided = "Not provided"
        var id: String { rawValue }
    }

    private var activeFilterCount: Int {
        (roleFilter != .all ? 1 : 0) + (wwvpFilter != .all ? 1 : 0)
    }

    private var filtered: [CoachManagerRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        var data = rows
        switch roleFilter {
        case .all: break
        case .coach: data = data.filter { $0.clubRole.lowercased() == "coach" }
        case .manager: data = data.filter { $0.clubRole.lowercased() == "manager" }
        }
        switch wwvpFilter {
        case .all: break
        case .approved: data = data.filter { $0.wwvpStatus == "approved" }
        case .sighted: data = data.filter { $0.wwvpStatus == "sighted" }
        case .pending: data = data.filter { $0.wwvpStatus == "pending" }
        case .notProvided:
            data = data.filter {
                $0.wwvpStatus != "approved"
                    && $0.wwvpStatus != "sighted"
                    && $0.wwvpStatus != "pending"
            }
        }
        guard !q.isEmpty else { return data }
        return data.filter {
            $0.fullName.lowercased().contains(q)
                || ($0.email ?? "").lowercased().contains(q)
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
                    title: "No coaches or managers",
                    systemImage: "person.crop.rectangle.stack",
                    message: "Add members with a coach or manager role to populate this list."
                )
            } else {
                List(filtered) { row in
                    CoachManagerRowView(row: row)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Coaches & managers")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Role", selection: $roleFilter) {
                        ForEach(RoleFilter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Picker("WWVP", selection: $wwvpFilter) {
                        ForEach(WwvpFilter.allCases) { Text($0.rawValue).tag($0) }
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
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search name or email"
        )
    }

    private func load() async {
        let hasCachedCoachesManagers = (try? sync.store?.hasCachedCoachesManagers()) ?? false
        if hasCachedCoachesManagers {
            rows = (try? sync.store?.cachedCoachesManagers()) ?? []
        }
        loading = !hasCachedCoachesManagers && rows.isEmpty
        error = nil
        defer { loading = false }
        do {
            let fresh = try await convex.listCoachesManagers()
            rows = fresh
            try? sync.store?.replaceCoachesManagers(fresh)
        } catch let err {
            if !hasCachedCoachesManagers && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load coaches and managers.")
            }
        }
    }
}

private struct CoachManagerRowView: View {
    let row: CoachManagerRow

    var body: some View {
        HStack(spacing: GHSpacing.lg) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.fullName)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Text(row.clubRole.capitalized)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
                if let phone = row.phone {
                    Text(phone)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            Spacer()
            wwvpBadge
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var wwvpBadge: some View {
        switch row.wwvpStatus {
        case "approved":
            GHBadge(text: "Approved", variant: .success)
        case "sighted":
            GHBadge(text: "Sighted", variant: .success)
        case "pending":
            GHBadge(text: "Pending", variant: .warning)
        default:
            GHBadge(text: "Not provided", variant: .danger)
        }
    }
}
