import SwiftUI

/// Announcements feed. Pinned items float to the top. Tapping a row
/// pushes the full body and marks it read via `announcements:markRead`.
struct AnnouncementsListView: View {
    let canEdit: Bool
    let canCreateOrgWide: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var announcements: [Announcement] = []
    @State private var teams: [Team] = []
    @State private var loading = true
    @State private var error: String?
    @State private var unreadOnly = false
    @State private var scope: Scope = .all
    @State private var creating = false
    @State private var editing: Announcement?
    @State private var deleting: Announcement?

    init(canEdit: Bool = false, canCreateOrgWide: Bool = false) {
        self.canEdit = canEdit
        self.canCreateOrgWide = canCreateOrgWide
    }

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
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if canEdit && canManage(row) && !row.id.hasPrefix("local:") {
                            Button {
                                editing = row
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(Color.gh.accent)
                        }
                        if canEdit && canManage(row) {
                            Button(role: .destructive) {
                                deleting = row
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
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
                HStack {
                    if canEdit {
                        Button {
                            creating = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("New announcement")
                    }
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
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $creating) {
            AnnouncementEditorSheet(
                announcement: nil,
                teams: teams,
                canCreateOrgWide: canCreateOrgWide
            ) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload { Task { await load() } }
            }
        }
        .sheet(item: $editing) { row in
            AnnouncementEditorSheet(
                announcement: row,
                teams: teams,
                canCreateOrgWide: canCreateOrgWide
            ) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload { Task { await load() } }
            }
        }
        .confirmationDialog(
            "Delete this announcement?",
            isPresented: Binding(
                get: { deleting != nil },
                set: { if !$0 { deleting = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let row = deleting {
                Button("Delete", role: .destructive) {
                    Task { await delete(row) }
                }
            }
        } message: {
            if let row = deleting {
                Text(row.title)
            }
        }
    }

    private func load() async {
        let hasCachedAnnouncements = (try? sync.store?.hasCachedAnnouncements()) ?? false
        let hasCachedTeams = (try? sync.store?.hasCachedTeams()) ?? false
        if hasCachedAnnouncements {
            announcements = (try? sync.store?.cachedAnnouncements()) ?? []
            loading = false
        } else if announcements.isEmpty {
            loading = true
        }
        if hasCachedTeams {
            teams = (try? sync.store?.cachedTeams()) ?? []
        }
        error = nil
        do {
            async let announcementsTask = convex.listAnnouncements()
            async let teamsTask = convex.listTeams(includeInactive: true)
            let (fresh, teamRows) = try await (announcementsTask, teamsTask)
            announcements = fresh
            teams = teamRows
            try? sync.store?.replaceAnnouncements(fresh)
            try? sync.store?.replaceTeams(teamRows)
        } catch let err {
            if !hasCachedAnnouncements && announcements.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load announcements.")
            }
        }
        loading = false
    }

    private func canManage(_ announcement: Announcement) -> Bool {
        canCreateOrgWide || announcement.teamId != nil
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
                teamId: a.teamId,
                teamName: a.teamName,
                authorName: a.authorName,
                isRead: true,
                creationTime: a.creationTime
            )
            try? sync.store?.replaceAnnouncements(announcements)
        }
        do {
            try sync.enqueue(
                kind: .announcementRead,
                title: "Mark announcement read",
                payload: AnnouncementReadPayload(announcementId: id)
            )
            await sync.coordinator?.syncIfOnline()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue read receipt.")
        }
    }

    private func upsertLocal(_ announcement: Announcement) {
        if let index = announcements.firstIndex(where: { $0.id == announcement.id }) {
            announcements[index] = announcement
        } else {
            announcements.insert(announcement, at: 0)
        }
        try? sync.store?.replaceAnnouncements(announcements)
    }

    private func removeLocal(_ id: String) {
        announcements.removeAll { $0.id == id }
        try? sync.store?.replaceAnnouncements(announcements)
    }

    private func delete(_ announcement: Announcement) async {
        do {
            if announcement.id.hasPrefix("local:") {
                let clientId = String(announcement.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                removeLocal(announcement.id)
                sync.coordinator?.refreshUnsettledCount()
                return
            }
            let op = try sync.enqueue(
                kind: .announcementDelete,
                title: "Delete \(announcement.title)",
                payload: AnnouncementDeletePayload(announcementId: announcement.id)
            )
            removeLocal(announcement.id)
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load()
            }
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue announcement deletion.")
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

private struct AnnouncementEditorSheet: View {
    let announcement: Announcement?
    let teams: [Team]
    let canCreateOrgWide: Bool
    let onSaved: (_ saved: Announcement, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var bodyText: String
    @State private var teamId: String
    @State private var pinned: Bool
    @State private var saving = false
    @State private var error: String?

    init(
        announcement: Announcement?,
        teams: [Team],
        canCreateOrgWide: Bool,
        onSaved: @escaping (_ saved: Announcement, _ shouldReload: Bool) -> Void
    ) {
        self.announcement = announcement
        self.teams = teams
        self.canCreateOrgWide = canCreateOrgWide
        self.onSaved = onSaved
        self._title = State(initialValue: announcement?.title ?? "")
        self._bodyText = State(initialValue: announcement?.body ?? "")
        self._teamId = State(initialValue: announcement?.teamId ?? "")
        self._pinned = State(initialValue: canCreateOrgWide ? (announcement?.pinned ?? false) : false)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section {
                        Text(error)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.danger)
                    }
                }
                Section("Announcement") {
                    TextField("Title", text: $title)
                    TextField("Body", text: $bodyText, axis: .vertical)
                        .lineLimit(4...10)
                    Picker("Audience", selection: $teamId) {
                        if canCreateOrgWide {
                            Text("Org-wide").tag("")
                        }
                        ForEach(teams.filter(\.isActive)) { team in
                            Text(team.name).tag(team.id)
                        }
                    }
                    if canCreateOrgWide {
                        Toggle("Pinned", isOn: $pinned)
                    }
                }
            }
            .navigationTitle(announcement == nil ? "New announcement" : "Edit announcement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving)
                }
            }
        }
    }

    private func save() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            error = "Title is required."
            return
        }
        guard !trimmedBody.isEmpty else {
            error = "Body is required."
            return
        }
        if !canCreateOrgWide && cleaned(teamId) == nil {
            error = "Choose a team for this announcement."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        let payload = AnnouncementMutationPayload(
            title: trimmedTitle,
            body: trimmedBody,
            teamId: cleaned(teamId),
            pinned: canCreateOrgWide ? pinned : false
        )

        do {
            let op: PendingSyncOperation
            let saved: Announcement
            if let announcement {
                op = try sync.enqueue(
                    kind: .announcementUpdate,
                    title: "Update \(trimmedTitle)",
                    payload: AnnouncementUpdatePayload(
                        announcementId: announcement.id,
                        announcement: payload
                    )
                )
                saved = makeAnnouncement(
                    id: announcement.id,
                    payload: payload,
                    authorName: announcement.authorName,
                    isRead: announcement.isRead,
                    creationTime: announcement.creationTime
                )
            } else {
                op = try sync.enqueue(
                    kind: .announcementCreate,
                    title: "Create \(trimmedTitle)",
                    payload: payload
                )
                saved = makeAnnouncement(
                    id: "local:\(op.clientId)",
                    payload: payload,
                    authorName: nil,
                    isRead: true,
                    creationTime: Date.now.timeIntervalSince1970 * 1000
                )
            }
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue announcement change.")
        }
    }

    private func makeAnnouncement(
        id: String,
        payload: AnnouncementMutationPayload,
        authorName: String?,
        isRead: Bool,
        creationTime: Double
    ) -> Announcement {
        let team = teams.first { $0.id == payload.teamId }
        return Announcement(
            id: id,
            title: payload.title,
            body: payload.body,
            pinned: payload.pinned,
            teamId: payload.teamId,
            teamName: team?.name,
            authorName: authorName,
            isRead: isRead,
            creationTime: creationTime
        )
    }

    private func updateCached(_ announcement: Announcement) {
        var rows = (try? sync.store?.cachedAnnouncements()) ?? []
        if let index = rows.firstIndex(where: { $0.id == announcement.id }) {
            rows[index] = announcement
        } else {
            rows.insert(announcement, at: 0)
        }
        try? sync.store?.replaceAnnouncements(rows)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
