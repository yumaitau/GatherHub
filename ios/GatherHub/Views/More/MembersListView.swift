import SwiftUI

/// Member roster — search-as-you-type list. Tappable rows reveal the
/// basic profile. The medical-notes section in the detail is gated by
/// role server-side; we just render whatever the server returns.
struct MembersListView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var members: [Member] = []
    @State private var loading = true
    @State private var error: String?
    @State private var isStale = false
    @State private var query = ""
    @State private var statusFilter: StatusFilter = .active
    @State private var volunteerOnly = false

    enum StatusFilter: String, CaseIterable, Identifiable {
        case active = "Active only"
        case inactive = "Inactive only"
        case all = "Everyone"
        var id: String { rawValue }
    }

    private var filtered: [Member] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        var rows = members
        switch statusFilter {
        case .active: rows = rows.filter { $0.status == .active }
        case .inactive: rows = rows.filter { $0.status == .inactive }
        case .all: break
        }
        if volunteerOnly { rows = rows.filter { $0.isVolunteer == true } }
        guard !q.isEmpty else { return rows }
        return rows.filter {
            $0.fullName.lowercased().contains(q)
                || ($0.email ?? "").lowercased().contains(q)
                || ($0.phone ?? "").lowercased().contains(q)
        }
    }

    private var activeFilterCount: Int {
        (statusFilter != .active ? 1 : 0) + (volunteerOnly ? 1 : 0)
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading members…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load members",
                    message: error,
                    retry: load
                )
            } else if members.isEmpty {
                EmptyStateView(
                    title: "No members",
                    systemImage: "person.2",
                    message: "Add members on the web admin and they will appear here."
                )
            } else {
                list
            }
        }
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Status", selection: $statusFilter) {
                        ForEach(StatusFilter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Toggle("Volunteers only", isOn: $volunteerOnly)
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
            prompt: "Search name, email, phone"
        )
    }

    private var list: some View {
        List(filtered) { member in
            NavigationLink {
                MemberDetailView(member: member)
            } label: {
                MemberRow(member: member)
            }
        }
        .listStyle(.plain)
    }

    private func load() async {
        let hasCachedMembers = (try? sync.store?.hasCachedMembers()) ?? false
        if hasCachedMembers {
            members = (try? sync.store?.cachedMembers()) ?? []
            isStale = true
            loading = false
        } else if members.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listMembers()
            members = fresh
            try? sync.store?.replaceMembers(fresh)
            isStale = false
        } catch let err {
            if !hasCachedMembers && members.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load members.")
            } else {
                isStale = true
            }
        }
        loading = false
    }
}

private struct MemberRow: View {
    let member: Member

    var body: some View {
        HStack(spacing: GHSpacing.lg) {
            Circle()
                .fill(Color.gh.accentWash)
                .frame(width: 40, height: 40)
                .overlay(
                    Text(initials)
                        .font(.gh.caption.weight(.semibold))
                        .foregroundStyle(Color.gh.accent)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(member.fullName)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                if let email = member.email {
                    Text(email)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                        .lineLimit(1)
                }
            }
            Spacer()
            if member.status == .inactive {
                GHBadge(text: "Inactive", variant: .muted)
            } else if member.isVolunteer == true {
                GHBadge(text: "Vol", variant: .info)
            }
        }
        .padding(.vertical, 2)
    }

    private var initials: String {
        let first = member.firstName.first.map { String($0) } ?? ""
        let last = member.lastName.first.map { String($0) } ?? ""
        return (first + last).uppercased()
    }
}

struct MemberDetailView: View {
    let member: Member

    var body: some View {
        List {
            Section {
                HStack(spacing: GHSpacing.lg) {
                    Circle()
                        .fill(Color.gh.accentWash)
                        .frame(width: 56, height: 56)
                        .overlay(
                            Text(initials)
                                .font(.gh.title.weight(.semibold))
                                .foregroundStyle(Color.gh.accent)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(member.fullName).font(.gh.title)
                        Text(member.status.rawValue.capitalized)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                }
                .padding(.vertical, 4)
            }
            Section("Contact") {
                if let email = member.email {
                    LabeledContent("Email", value: email)
                }
                if let phone = member.phone {
                    LabeledContent("Phone", value: phone)
                }
            }
        }
        .navigationTitle(member.fullName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var initials: String {
        let first = member.firstName.first.map { String($0) } ?? ""
        let last = member.lastName.first.map { String($0) } ?? ""
        return (first + last).uppercased()
    }
}
