import SwiftUI

/// Announcements feed. Pinned items float to the top. Tapping a row
/// pushes the full body and marks it read via `announcements:markRead`.
struct AnnouncementsListView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var announcements: [Announcement] = []
    @State private var loading = true
    @State private var error: String?
    @State private var unreadOnly = false
    @State private var scope: Scope = .all

    enum Scope: String, CaseIterable, Identifiable {
        case all = "All"
        case org = "Org-wide only"
        case team = "Team only"
        var id: String { rawValue }
    }

    private var filtered: [Announcement] {
        var rows = announcements
        if unreadOnly { rows = rows.filter { !$0.isRead } }
        switch scope {
        case .all: break
        case .org: rows = rows.filter { $0.teamName == nil }
        case .team: rows = rows.filter { $0.teamName != nil }
        }
        return rows
    }

    private var unreadCount: Int {
        announcements.filter { !$0.isRead }.count
    }

    private var activeFilterCount: Int {
        (unreadOnly ? 1 : 0) + (scope != .all ? 1 : 0)
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load announcements",
                    message: error,
                    retry: load
                )
            } else if announcements.isEmpty {
                EmptyStateView(
                    title: "No announcements",
                    systemImage: "megaphone",
                    message: "Nothing's been posted yet."
                )
            } else {
                List(filtered) { row in
                    NavigationLink {
                        AnnouncementDetailView(
                            announcement: row,
                            onRead: { id in await markRead(id) }
                        )
                    } label: {
                        AnnouncementRow(announcement: row)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Announcements")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if unreadCount > 0 {
                ToolbarItem(placement: .topBarLeading) {
                    Text("\(unreadCount) unread")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Toggle("Unread only", isOn: $unreadOnly)
                    Picker("Scope", selection: $scope) {
                        ForEach(Scope.allCases) { Text($0.rawValue).tag($0) }
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
    }

    private func load() async {
        if let cached = try? sync.store?.cachedAnnouncements(), !cached.isEmpty {
            announcements = cached
            loading = false
        } else if announcements.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listAnnouncements()
            announcements = fresh
            try? sync.store?.replaceAnnouncements(fresh)
        } catch let err {
            if announcements.isEmpty { error = err.localizedDescription }
        }
        loading = false
    }

    private func markRead(_ id: String) async {
        // Optimistic local update.
        if let idx = announcements.firstIndex(where: { $0.id == id }) {
            let a = announcements[idx]
            announcements[idx] = Announcement(
                id: a.id,
                title: a.title,
                body: a.body,
                pinned: a.pinned,
                teamName: a.teamName,
                authorName: a.authorName,
                isRead: true,
                creationTime: a.creationTime
            )
            try? sync.store?.replaceAnnouncements(announcements)
        }
        // Queue the read receipt so it survives offline.
        guard let store = sync.store else { return }
        let payload = AnnouncementReadPayload(announcementId: id)
        if let data = try? JSONEncoder().encode(payload) {
            try? store.enqueue(
                kind: .announcementRead,
                title: "Mark announcement read",
                payload: data
            )
            await sync.coordinator?.syncIfOnline()
        }
    }
}

private struct AnnouncementRow: View {
    let announcement: Announcement

    var body: some View {
        HStack(alignment: .top, spacing: GHSpacing.md) {
            // Unread dot.
            Circle()
                .fill(announcement.isRead ? Color.clear : Color.gh.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: GHSpacing.xs) {
                HStack(spacing: GHSpacing.sm) {
                    if announcement.pinned {
                        Image(systemName: "pin.fill")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.warning)
                    }
                    Text(announcement.title)
                        .font(.gh.bodyStrong)
                        .foregroundStyle(Color.gh.inkStrong)
                        .lineLimit(1)
                }
                Text(announcement.body)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
                    .lineLimit(2)
                HStack(spacing: GHSpacing.sm) {
                    if let team = announcement.teamName {
                        Text(team)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    } else {
                        Text("Org-wide")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                    Text(announcement.creationDate, style: .relative)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

private struct AnnouncementDetailView: View {
    let announcement: Announcement
    let onRead: (String) async -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GHSpacing.lg) {
                HStack {
                    if let team = announcement.teamName {
                        GHBadge(text: team, variant: .muted)
                    } else {
                        GHBadge(text: "Org-wide", variant: .info)
                    }
                    if announcement.pinned {
                        GHBadge(text: "Pinned", variant: .warning)
                    }
                    Spacer()
                }
                Text(announcement.title)
                    .font(.gh.headline)
                    .foregroundStyle(Color.gh.inkStrong)
                if let author = announcement.authorName {
                    Text("Posted by \(author) · \(announcement.creationDate.formatted(date: .abbreviated, time: .shortened))")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
                Text(announcement.body)
                    .font(.gh.body)
                    .foregroundStyle(Color.gh.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(GHSpacing.pageInset)
        }
        .background(Color.gh.paper.ignoresSafeArea())
        .navigationTitle(announcement.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if !announcement.isRead {
                await onRead(announcement.id)
            }
        }
    }
}
