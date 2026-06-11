import SwiftUI

/// Community feed for iOS — mirrors the web `/community` surface. Newest-first
/// posts scoped to the whole org or one team's feed (team feeds also include
/// org-wide posts). Tapping a post opens the full thread with one-level comment
/// replies, the fixed reaction set, and a "seen by N" receipt.
///
/// Posts are online-only (no offline cache layer), so loads surface an
/// `OfflineStateView` on failure rather than reading from `sync.store`.
struct PostsListView: View {
    @EnvironmentObject private var convex: ConvexService

    @State private var posts: [Post] = []
    @State private var teams: [Team] = []
    @State private var access: PostingAccess?
    @State private var loading = true
    @State private var error: String?
    @State private var scopeTeamId: String?
    @State private var composing = false
    @State private var editingPost: Post?
    @State private var deletingPost: Post?
    @State private var showingPostingSettings = false

    private var canCompose: Bool {
        (access?.canPost ?? false) || (access?.canModerate ?? false)
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load posts",
                    message: error,
                    retry: load
                )
            } else if posts.isEmpty {
                EmptyStateView(
                    title: "No posts yet",
                    systemImage: "bubble.left.and.bubble.right",
                    message: canCompose
                        ? "Be the first to post an update."
                        : "Nothing's been posted to this feed yet.",
                    actionTitle: canCompose ? "New post" : nil,
                    action: canCompose ? { composing = true } : nil
                )
            } else {
                List {
                    ForEach(posts) { post in
                        NavigationLink {
                            PostDetailView(postId: post.id) { Task { await load() } }
                        } label: {
                            PostFeedRow(post: post)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if post.canEdit && !post.id.hasPrefix("local:") {
                                Button {
                                    editingPost = post
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(Color.gh.accent)
                                Button(role: .destructive) {
                                    deletingPost = post
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Community")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack {
                    if canCompose {
                        Button {
                            composing = true
                        } label: {
                            Image(systemName: "square.and.pencil")
                        }
                        .accessibilityLabel("New post")
                    }
                    Menu {
                        Picker("Feed", selection: $scopeTeamId) {
                            Text("All posts").tag(String?.none)
                            ForEach(teams) { team in
                                Text(team.name).tag(String?.some(team.id))
                            }
                        }
                        if access?.canModerate == true {
                            Divider()
                            Button {
                                showingPostingSettings = true
                            } label: {
                                Label("Who can post", systemImage: "person.badge.key")
                            }
                        }
                    } label: {
                        Image(systemName: scopeTeamId == nil
                              ? "line.3.horizontal.decrease.circle"
                              : "line.3.horizontal.decrease.circle.fill")
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: scopeTeamId) { _, _ in Task { await load() } }
        .sheet(isPresented: $composing) {
            PostEditorSheet(
                post: nil,
                teams: teams,
                canModerate: access?.canModerate ?? false,
                defaultTeamId: scopeTeamId
            ) { Task { await load() } }
        }
        .sheet(item: $editingPost) { post in
            PostEditorSheet(
                post: post,
                teams: teams,
                canModerate: access?.canModerate ?? false,
                defaultTeamId: post.teamId
            ) { Task { await load() } }
        }
        .sheet(isPresented: $showingPostingSettings) {
            PostingSettingsSheet(teams: teams) { Task { await load() } }
        }
        .confirmationDialog(
            "Delete this post?",
            isPresented: Binding(
                get: { deletingPost != nil },
                set: { if !$0 { deletingPost = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let post = deletingPost {
                Button("Delete", role: .destructive) {
                    Task { await delete(post) }
                }
            }
        } message: {
            Text("This removes its comments and reactions too.")
        }
    }

    private func load() async {
        if posts.isEmpty { loading = true }
        error = nil
        do {
            async let postsTask = convex.listPosts(teamId: scopeTeamId)
            async let teamsTask = convex.listTeams(includeInactive: false)
            async let accessTask = convex.myPostingAccess(teamId: scopeTeamId)
            let (freshPosts, freshTeams, freshAccess) = try await (postsTask, teamsTask, accessTask)
            posts = freshPosts
            teams = freshTeams
            access = freshAccess
        } catch let err {
            if posts.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load posts.")
            }
        }
        loading = false
    }

    private func delete(_ post: Post) async {
        do {
            try await convex.removePost(postId: post.id)
            posts.removeAll { $0.id == post.id }
        } catch {
            await load()
        }
    }
}

// MARK: - Feed row

private struct PostFeedRow: View {
    let post: Post

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.xs) {
            HStack(spacing: GHSpacing.sm) {
                if !post.isRead {
                    Circle()
                        .fill(Color.gh.accent)
                        .frame(width: 7, height: 7)
                        .accessibilityLabel("Unread")
                }
                Text(post.authorName ?? "Unknown")
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Spacer(minLength: GHSpacing.sm)
                GHBadge(
                    text: post.teamName ?? "Org-wide",
                    variant: post.teamName == nil ? .accent : .muted
                )
            }

            if let title = post.title, !title.isEmpty {
                Text(title)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
            }
            Text(post.body)
                .font(.gh.body)
                .foregroundStyle(Color.gh.inkSoft)
                .lineLimit(3)

            HStack(spacing: GHSpacing.md) {
                Text(post.creationDate.formatted(.relative(presentation: .named)))
                if post.editedAt != nil {
                    Text("· edited")
                }
                Spacer()
                if post.reactionCounts.total > 0 {
                    Label("\(post.reactionCounts.total)", systemImage: "hand.thumbsup")
                }
                Label(
                    "\(post.commentCount)",
                    systemImage: post.commentsDisabled ? "bubble.slash" : "bubble.left"
                )
            }
            .font(.gh.caption)
            .foregroundStyle(Color.gh.inkQuiet)
        }
        .padding(.vertical, GHSpacing.xs)
    }
}

// MARK: - Detail

struct PostDetailView: View {
    let postId: String
    var onChanged: () -> Void = {}

    @EnvironmentObject private var convex: ConvexService
    @Environment(\.dismiss) private var dismiss

    @State private var detail: PostDetail?
    @State private var loading = true
    @State private var error: String?
    @State private var newComment = ""
    @State private var posting = false
    @State private var replyingTo: PostComment?
    @State private var editingComment: PostComment?
    @State private var editingPost = false
    @State private var deletePost = false

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(title: "Couldn't load post", message: error, retry: { await load() })
            } else if let detail {
                content(detail)
            } else {
                EmptyStateView(
                    title: "Post unavailable",
                    systemImage: "bubble.left",
                    message: "It may have been deleted."
                )
            }
        }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let detail, detail.canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            editingPost = true
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        Button(role: .destructive) {
                            deletePost = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .task { await load(markRead: true) }
        .sheet(isPresented: $editingPost) {
            if let detail {
                PostEditorSheet(
                    post: detail.asPost,
                    teams: [],
                    canModerate: detail.canEdit,
                    defaultTeamId: detail.teamId
                ) { Task { await load() } }
            }
        }
        .sheet(item: $editingComment) { comment in
            CommentEditorSheet(comment: comment) { Task { await load() } }
        }
        .confirmationDialog(
            "Delete this post?",
            isPresented: $deletePost,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Task { await removePost() }
            }
        }
    }

    @ViewBuilder
    private func content(_ detail: PostDetail) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: GHSpacing.lg) {
                    postHeader(detail)
                    Divider()
                    commentsSection(detail)
                }
                .padding(GHSpacing.pageInset)
            }

            if !detail.commentsDisabled {
                commentComposer
            }
        }
        .background(Color.gh.paper.ignoresSafeArea())
    }

    private func postHeader(_ detail: PostDetail) -> some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack(spacing: GHSpacing.sm) {
                Text(detail.authorName ?? "Unknown")
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Spacer()
                GHBadge(
                    text: detail.teamName ?? "Org-wide",
                    variant: detail.teamName == nil ? .accent : .muted
                )
            }
            Text(detail.creationDate.formatted(date: .abbreviated, time: .shortened)
                 + (detail.editedAt != nil ? " · edited" : ""))
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)

            if let title = detail.title, !title.isEmpty {
                Text(title)
                    .font(.gh.headline)
                    .foregroundStyle(Color.gh.inkStrong)
            }
            Text(detail.body)
                .font(.gh.body)
                .foregroundStyle(Color.gh.ink)
                .fixedSize(horizontal: false, vertical: true)

            PostReactionBar(counts: detail.reactionCounts, myReaction: detail.myReaction) { kind in
                Task { await react(kind, on: nil, current: detail.myReaction) }
            }

            Label(
                detail.seenCount == 1 ? "Seen by 1" : "Seen by \(detail.seenCount)",
                systemImage: "eye"
            )
            .font(.gh.caption)
            .foregroundStyle(Color.gh.inkQuiet)
        }
    }

    @ViewBuilder
    private func commentsSection(_ detail: PostDetail) -> some View {
        if detail.commentsDisabled {
            Text("Comments are turned off for this post.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
        } else if detail.comments.isEmpty {
            Text("No comments yet. Start the conversation.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
        } else {
            VStack(alignment: .leading, spacing: GHSpacing.lg) {
                ForEach(detail.comments) { comment in
                    CommentBlock(
                        comment: comment,
                        onReact: { kind, current in
                            Task { await react(kind, on: comment.id, current: current) }
                        },
                        onReplyReact: { reply, kind, current in
                            Task { await react(kind, on: reply.id, current: current) }
                        },
                        onReply: { replyingTo = comment },
                        onEdit: { editingComment = $0 },
                        onDelete: { Task { await removeComment($0) } }
                    )
                }
            }
        }
    }

    private var commentComposer: some View {
        VStack(spacing: GHSpacing.xs) {
            if let replyingTo {
                HStack {
                    Text("Replying to \(replyingTo.authorName ?? "comment")")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                    Spacer()
                    Button("Cancel") { self.replyingTo = nil }
                        .font(.gh.caption)
                }
            }
            HStack(spacing: GHSpacing.sm) {
                TextField(
                    replyingTo == nil ? "Write a comment…" : "Write a reply…",
                    text: $newComment,
                    axis: .vertical
                )
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)
                Button {
                    Task { await submitComment() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                }
                .disabled(posting || newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(GHSpacing.md)
        .background(Color.gh.surfaceSunk)
    }

    // MARK: Actions

    private func load(markRead: Bool = false) async {
        error = nil
        do {
            if markRead {
                try? await convex.markPostRead(postId)
            }
            detail = try await convex.getPost(postId)
            onChanged()
        } catch let err {
            if detail == nil {
                error = UserFacingError.message(err, fallback: "Couldn't load post.")
            }
        }
        loading = false
    }

    private func react(_ kind: PostReactionKind, on commentId: String?, current: PostReactionKind?) async {
        let next: PostReactionKind? = current == kind ? nil : kind
        do {
            try await convex.setPostReaction(postId: postId, commentId: commentId, kind: next)
            await load()
        } catch {
            await load()
        }
    }

    private func submitComment() async {
        let body = newComment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        posting = true
        defer { posting = false }
        do {
            try await convex.addPostComment(
                postId: postId,
                body: body,
                parentCommentId: replyingTo?.id
            )
            newComment = ""
            replyingTo = nil
            await load()
        } catch {
            // Leave the draft in place so the user can retry.
        }
    }

    private func removeComment(_ comment: PostComment) async {
        do {
            try await convex.removePostComment(commentId: comment.id)
            await load()
        } catch {
            await load()
        }
    }

    private func removePost() async {
        do {
            try await convex.removePost(postId: postId)
            onChanged()
            dismiss()
        } catch {
            await load()
        }
    }
}

// MARK: - Comment block (top-level comment plus its replies)

private struct CommentBlock: View {
    let comment: PostComment
    let onReact: (PostReactionKind, PostReactionKind?) -> Void
    let onReplyReact: (PostComment, PostReactionKind, PostReactionKind?) -> Void
    let onReply: () -> Void
    let onEdit: (PostComment) -> Void
    let onDelete: (PostComment) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            CommentRow(
                comment: comment,
                onReact: { onReact($0, comment.myReaction) },
                onReply: onReply,
                onEdit: { onEdit(comment) },
                onDelete: { onDelete(comment) }
            )
            ForEach(comment.replies ?? []) { reply in
                CommentRow(
                    comment: reply,
                    onReact: { onReplyReact(reply, $0, reply.myReaction) },
                    onReply: nil,
                    onEdit: { onEdit(reply) },
                    onDelete: { onDelete(reply) }
                )
                .padding(.leading, GHSpacing.xl)
            }
        }
    }
}

private struct CommentRow: View {
    let comment: PostComment
    let onReact: (PostReactionKind) -> Void
    let onReply: (() -> Void)?
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.xs) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: GHSpacing.sm) {
                    Text(comment.authorName ?? "Unknown")
                        .font(.gh.bodyStrong)
                        .foregroundStyle(Color.gh.inkStrong)
                    Text(comment.creationDate.formatted(.relative(presentation: .named)))
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                    if comment.editedAt != nil {
                        Text("· edited")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                }
                Text(comment.body)
                    .font(.gh.body)
                    .foregroundStyle(Color.gh.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(GHSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.gh.surface)
            .clipShape(RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous)
                    .stroke(Color.gh.hairline, lineWidth: 1)
            )

            HStack(spacing: GHSpacing.lg) {
                PostReactionBar(
                    counts: comment.reactionCounts,
                    myReaction: comment.myReaction,
                    compact: true,
                    onReact: onReact
                )
                if let onReply {
                    Button(action: onReply) {
                        Label("Reply", systemImage: "arrowshape.turn.up.left")
                    }
                    .font(.gh.caption)
                }
                if comment.canEdit {
                    Button("Edit", action: onEdit)
                        .font(.gh.caption)
                    Button("Delete", role: .destructive, action: onDelete)
                        .font(.gh.caption)
                }
                Spacer()
            }
            .labelStyle(.titleAndIcon)
            .tint(Color.gh.inkSoft)
        }
    }
}

// MARK: - Reaction bar

private struct PostReactionBar: View {
    let counts: PostReactionCounts
    let myReaction: PostReactionKind?
    var compact = false
    let onReact: (PostReactionKind) -> Void

    var body: some View {
        HStack(spacing: GHSpacing.xs) {
            ForEach(PostReactionKind.allCases) { kind in
                let count = counts.count(for: kind)
                let mine = myReaction == kind
                if !(compact && count == 0 && !mine) {
                    Button {
                        onReact(kind)
                    } label: {
                        HStack(spacing: 3) {
                            Text(kind.emoji)
                            if count > 0 {
                                Text("\(count)")
                                    .font(.gh.caption)
                                    .foregroundStyle(mine ? Color.gh.accentInk : Color.gh.inkSoft)
                            }
                        }
                        .padding(.horizontal, GHSpacing.sm)
                        .padding(.vertical, 3)
                        .background(mine ? Color.gh.accentWash : Color.gh.surfaceSunk)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule().stroke(
                                mine ? Color.gh.accent : Color.gh.hairline,
                                lineWidth: 1
                            )
                        )
                    }
                    .buttonStyle(.plain)
                } else if compact {
                    Button {
                        onReact(kind)
                    } label: {
                        Text(kind.emoji).opacity(0.4)
                            .padding(.horizontal, 3)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Editors

private struct PostEditorSheet: View {
    let post: Post?
    let teams: [Team]
    let canModerate: Bool
    let defaultTeamId: String?
    let onSaved: () -> Void

    @EnvironmentObject private var convex: ConvexService
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var message: String
    @State private var teamId: String?
    @State private var commentsDisabled: Bool
    @State private var saving = false
    @State private var error: String?

    init(post: Post?, teams: [Team], canModerate: Bool, defaultTeamId: String?, onSaved: @escaping () -> Void) {
        self.post = post
        self.teams = teams
        self.canModerate = canModerate
        self.defaultTeamId = defaultTeamId
        self.onSaved = onSaved
        _title = State(initialValue: post?.title ?? "")
        _message = State(initialValue: post?.body ?? "")
        _teamId = State(initialValue: post?.teamId ?? defaultTeamId)
        _commentsDisabled = State(initialValue: post?.commentsDisabled ?? false)
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
                // Audience can only be chosen at creation; the backend update
                // does not move a post between feeds.
                if post == nil && !teams.isEmpty {
                    Section("Audience") {
                        Picker("Post to", selection: $teamId) {
                            Text("Org-wide").tag(String?.none)
                            ForEach(teams) { team in
                                Text(team.name).tag(String?.some(team.id))
                            }
                        }
                    }
                }
                Section("Post") {
                    TextField("Title (optional)", text: $title)
                    TextField("Message", text: $message, axis: .vertical)
                        .lineLimit(4...10)
                }
                if canModerate {
                    Section {
                        Toggle("Turn off comments", isOn: $commentsDisabled)
                    }
                }
            }
            .navigationTitle(post == nil ? "New post" : "Edit post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Posting…" : "Post") {
                        Task { await save() }
                    }
                    .disabled(saving || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func save() async {
        let trimmedBody = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedBody.isEmpty else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        saving = true
        defer { saving = false }
        error = nil
        do {
            if let post {
                try await convex.updatePost(
                    postId: post.id,
                    title: trimmedTitle.isEmpty ? nil : trimmedTitle,
                    body: trimmedBody,
                    commentsDisabled: commentsDisabled
                )
            } else {
                try await convex.createPost(
                    title: trimmedTitle.isEmpty ? nil : trimmedTitle,
                    body: trimmedBody,
                    teamId: teamId,
                    commentsDisabled: commentsDisabled
                )
            }
            onSaved()
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't save post.")
        }
    }
}

private struct CommentEditorSheet: View {
    let comment: PostComment
    let onSaved: () -> Void

    @EnvironmentObject private var convex: ConvexService
    @Environment(\.dismiss) private var dismiss

    @State private var text: String
    @State private var saving = false
    @State private var error: String?

    init(comment: PostComment, onSaved: @escaping () -> Void) {
        self.comment = comment
        self.onSaved = onSaved
        _text = State(initialValue: comment.body)
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
                Section("Comment") {
                    TextField("Comment", text: $text, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle("Edit comment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func save() async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        saving = true
        defer { saving = false }
        error = nil
        do {
            try await convex.updatePostComment(commentId: comment.id, body: trimmed)
            onSaved()
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't save comment.")
        }
    }
}

// MARK: - Member posting settings (moderator)

private struct PostingSettingsSheet: View {
    let teams: [Team]
    let onChanged: () -> Void

    @EnvironmentObject private var convex: ConvexService
    @Environment(\.dismiss) private var dismiss

    @State private var orgEnabled = false
    @State private var teamEnabled: [String: Bool] = [:]
    @State private var loading = true

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Committee and admins can always post. Allow ordinary members to create posts in these feeds.")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
                if loading {
                    Section { ProgressView() }
                } else {
                    Section("Org-wide feed") {
                        Toggle("Members can post", isOn: Binding(
                            get: { orgEnabled },
                            set: { setOrg($0) }
                        ))
                    }
                    if !teams.isEmpty {
                        Section("Team feeds") {
                            ForEach(teams) { team in
                                Toggle(team.name, isOn: Binding(
                                    get: { teamEnabled[team.id] ?? false },
                                    set: { setTeam(team.id, $0) }
                                ))
                            }
                        }
                    }
                }
            }
            .navigationTitle("Who can post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            orgEnabled = try await convex.myPostingAccess(teamId: nil).membersCanPost
            for team in teams {
                teamEnabled[team.id] = try await convex.myPostingAccess(teamId: team.id).membersCanPost
            }
        } catch {
            // Leave toggles at their defaults; the user can retry by reopening.
        }
        loading = false
    }

    private func setOrg(_ enabled: Bool) {
        orgEnabled = enabled
        Task {
            try? await convex.setMemberPosting(teamId: nil, enabled: enabled)
            onChanged()
        }
    }

    private func setTeam(_ teamId: String, _ enabled: Bool) {
        teamEnabled[teamId] = enabled
        Task {
            try? await convex.setMemberPosting(teamId: teamId, enabled: enabled)
            onChanged()
        }
    }
}

private extension PostDetail {
    /// Bridge back to a `Post` so the shared editor sheet can prefill from a
    /// loaded detail.
    var asPost: Post {
        Post(
            id: id,
            teamId: teamId,
            teamName: teamName,
            title: title,
            body: body,
            commentsDisabled: commentsDisabled,
            editedAt: editedAt,
            authorUserId: authorUserId,
            authorName: authorName,
            authorImageUrl: authorImageUrl,
            commentCount: commentCount,
            isRead: isRead,
            canEdit: canEdit,
            reactionCounts: reactionCounts,
            myReaction: myReaction,
            creationTime: creationTime
        )
    }
}
