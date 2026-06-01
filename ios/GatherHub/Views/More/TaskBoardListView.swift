import SwiftUI

struct TaskBoardListView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment

    @State private var tasks: [TaskBoardTask] = []
    @State private var members: [Member] = []
    @State private var loading = true
    @State private var error: String?
    @State private var search = ""
    @State private var creatingStatus: TaskStatus?
    @State private var editing: TaskBoardTask?
    @State private var deleting: TaskBoardTask?

    private var filteredTasks: [TaskBoardTask] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let rows = tasks.sorted { lhs, rhs in
            if lhs.status != rhs.status {
                return lhs.status.rawValue < rhs.status.rawValue
            }
            return lhs.order < rhs.order
        }
        guard !query.isEmpty else { return rows }
        return rows.filter { task in
            [
                task.title,
                task.description,
                task.assignee?.fullName,
                task.assignee?.email,
                task.dueDate,
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
                    title: "Couldn't load tasks",
                    message: error,
                    retry: load
                )
            } else if tasks.isEmpty {
                EmptyStateView(
                    title: "No tasks",
                    systemImage: "rectangle.3.group",
                    message: canEdit ? "Add the first task from this device." : "Tasks will appear here."
                )
            } else {
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: GHSpacing.md) {
                        ForEach(TaskStatus.allCases) { status in
                            TaskBoardColumnView(
                                status: status,
                                tasks: filteredTasks.filter { $0.status == status },
                                canEdit: canEdit,
                                onAdd: { creatingStatus = status },
                                onEdit: { editing = $0 },
                                onDelete: { deleting = $0 },
                                onMove: { task, status in
                                    Task { await move(task, to: status) }
                                }
                            )
                            .frame(width: 320)
                        }
                    }
                    .padding(GHSpacing.pageInset)
                }
                .background(Color.gh.paper.ignoresSafeArea())
                .searchable(text: $search, prompt: "Search tasks")
            }
        }
        .navigationTitle("Task board")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        creatingStatus = .todo
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add task")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $creatingStatus) { status in
            TaskEditorSheet(
                task: nil,
                members: members,
                initialStatus: status
            ) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload { Task { await load() } }
            }
        }
        .sheet(item: $editing) { task in
            TaskEditorSheet(
                task: task,
                members: members,
                initialStatus: task.status
            ) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload { Task { await load() } }
            }
        }
        .confirmationDialog(
            "Delete this task?",
            isPresented: Binding(
                get: { deleting != nil },
                set: { if !$0 { deleting = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let task = deleting {
                Button("Delete", role: .destructive) {
                    Task { await delete(task) }
                }
            }
        } message: {
            if let task = deleting {
                Text(task.title)
            }
        }
    }

    private func load() async {
        let hasCachedTasks = (try? sync.store?.hasCachedTasks()) ?? false
        let hasCachedMembers = (try? sync.store?.hasCachedMembers()) ?? false
        if hasCachedTasks {
            tasks = (try? sync.store?.cachedTasks()) ?? []
            loading = false
        } else if tasks.isEmpty {
            loading = true
        }
        if hasCachedMembers {
            members = (try? sync.store?.cachedMembers()) ?? []
        }
        error = nil

        do {
            async let tasksRequest = convex.listTasks()
            async let membersRequest = convex.listMembers()
            let (freshTasks, freshMembers) = try await (tasksRequest, membersRequest)
            tasks = freshTasks
            members = freshMembers
            try? sync.store?.replaceTasks(freshTasks)
            try? sync.store?.replaceMembers(freshMembers)
        } catch let err {
            if !hasCachedTasks && tasks.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load tasks.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ task: TaskBoardTask) {
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index] = task
        } else {
            tasks.append(task)
        }
        tasks = sortTasks(tasks)
        try? sync.store?.replaceTasks(tasks)
    }

    private func removeLocal(_ id: String) {
        tasks.removeAll { $0.id == id }
        try? sync.store?.replaceTasks(tasks)
    }

    private func delete(_ task: TaskBoardTask) async {
        deleting = nil
        do {
            if task.id.hasPrefix("local:") {
                let clientId = String(task.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                removeLocal(task.id)
                sync.coordinator?.refreshUnsettledCount()
                return
            }

            let op = try sync.enqueue(
                kind: .taskDelete,
                title: "Delete \(task.title)",
                payload: TaskDeletePayload(taskId: task.id)
            )
            removeLocal(task.id)
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load()
            }
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue task deletion.")
        }
    }

    private func move(_ task: TaskBoardTask, to status: TaskStatus) async {
        guard status != task.status else { return }
        let moved = makeTask(
            id: task.id,
            payload: payload(from: task, status: status),
            existing: task,
            order: nextOrder(for: status)
        )

        do {
            let op: PendingSyncOperation
            if task.id.hasPrefix("local:") {
                let clientId = String(task.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                op = try sync.enqueue(
                    kind: .taskCreate,
                    title: "Create \(moved.title)",
                    payload: payload(from: moved),
                    clientId: clientId
                )
            } else {
                op = try sync.enqueue(
                    kind: .taskMove,
                    title: "Move \(task.title)",
                    payload: TaskMovePayload(taskId: task.id, status: status)
                )
            }
            upsertLocal(moved)
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load()
            }
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue task move.")
        }
    }

    private func payload(from task: TaskBoardTask, status: TaskStatus? = nil) -> TaskMutationPayload {
        TaskMutationPayload(
            title: task.title,
            description: task.description,
            assigneeMemberId: task.assigneeMemberId,
            status: status ?? task.status,
            dueDate: task.dueDate,
            reminderEnabled: task.reminderEnabled,
            reminderEveryDays: task.reminderEveryDays
        )
    }

    private func makeTask(
        id: String,
        payload: TaskMutationPayload,
        existing: TaskBoardTask?,
        order: Double
    ) -> TaskBoardTask {
        let now = Date.now.timeIntervalSince1970 * 1000
        let assignee: TaskAssignee?
        if let assigneeId = payload.assigneeMemberId {
            assignee = members.first { $0.id == assigneeId && $0.isTaskAssignable }.map {
                TaskAssignee(id: $0.id, firstName: $0.firstName, lastName: $0.lastName, email: $0.email)
            } ?? existing?.assignee
        } else {
            assignee = nil
        }
        return TaskBoardTask(
            id: id,
            title: payload.title,
            description: payload.description,
            assigneeMemberId: payload.assigneeMemberId,
            status: payload.status,
            dueDate: payload.dueDate,
            order: order,
            reminderEnabled: payload.reminderEnabled,
            reminderEveryDays: payload.reminderEveryDays,
            lastReminderQueuedAt: existing?.lastReminderQueuedAt,
            createdBy: existing?.createdBy,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            completedAt: payload.status == .done ? now : nil,
            assignee: assignee,
            reminderStats: existing?.reminderStats ?? TaskReminderStats(queued: 0, sent: 0, failed: 0, skipped: 0)
        )
    }

    private func nextOrder(for status: TaskStatus) -> Double {
        ((tasks.filter { $0.status == status }.map(\.order).max() ?? -1) + 1)
    }

    private func sortTasks(_ rows: [TaskBoardTask]) -> [TaskBoardTask] {
        rows.sorted {
            if $0.status != $1.status {
                return $0.status.rawValue < $1.status.rawValue
            }
            return $0.order < $1.order
        }
    }
}

private struct TaskBoardColumnView: View {
    let status: TaskStatus
    let tasks: [TaskBoardTask]
    let canEdit: Bool
    let onAdd: () -> Void
    let onEdit: (TaskBoardTask) -> Void
    let onDelete: (TaskBoardTask) -> Void
    let onMove: (TaskBoardTask, TaskStatus) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.md) {
            HStack {
                Label(status.displayName, systemImage: status.systemImage)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Spacer()
                GHBadge(text: "\(tasks.count)", variant: .muted)
                if canEdit {
                    Button {
                        onAdd()
                    } label: {
                        Image(systemName: "plus.circle")
                    }
                    .accessibilityLabel("Add \(status.displayName) task")
                }
            }

            if tasks.isEmpty {
                Text("No tasks")
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
                    .frame(maxWidth: .infinity, minHeight: 88, alignment: .center)
                    .background(Color.gh.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else {
                VStack(spacing: GHSpacing.sm) {
                    ForEach(tasks) { task in
                        TaskCardView(
                            task: task,
                            canEdit: canEdit,
                            onEdit: { onEdit(task) },
                            onDelete: { onDelete(task) },
                            onMove: { onMove(task, $0) }
                        )
                    }
                }
            }
        }
        .padding(GHSpacing.md)
        .background(Color.gh.surfaceSunk, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct TaskCardView: View {
    let task: TaskBoardTask
    let canEdit: Bool
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onMove: (TaskStatus) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack(alignment: .top) {
                Button {
                    if canEdit { onEdit() }
                } label: {
                    VStack(alignment: .leading, spacing: GHSpacing.xs) {
                        HStack(spacing: GHSpacing.sm) {
                            Text(task.title)
                                .font(.gh.bodyStrong)
                                .foregroundStyle(Color.gh.inkStrong)
                                .lineLimit(2)
                            if task.id.hasPrefix("local:") {
                                GHBadge(text: "Queued", variant: .warning)
                            }
                        }
                        if let description = task.description {
                            Text(description)
                                .font(.gh.caption)
                                .foregroundStyle(Color.gh.inkSoft)
                                .lineLimit(3)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .disabled(!canEdit)

                if canEdit {
                    Menu {
                        Button("Edit", systemImage: "pencil", action: onEdit)
                        Menu("Move", systemImage: "arrow.right.arrow.left") {
                            ForEach(TaskStatus.allCases.filter { $0 != task.status }) { status in
                                Button(status.displayName) {
                                    onMove(status)
                                }
                            }
                        }
                        Button("Delete", systemImage: "trash", role: .destructive, action: onDelete)
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Task actions")
                }
            }

            HStack(spacing: GHSpacing.sm) {
                GHBadge(text: task.status.displayName, variant: statusVariant)
                if let dueDate = task.dueDate {
                    GHBadge(text: dueLabel(dueDate), variant: dueVariant(dueDate))
                }
            }

            HStack(spacing: GHSpacing.xs) {
                Image(systemName: "person")
                Text(task.assignee?.fullName ?? "Unassigned")
                    .lineLimit(1)
                Spacer(minLength: GHSpacing.sm)
                if task.reminderEnabled, task.dueDate != nil, task.status != .done {
                    Image(systemName: "envelope.badge")
                        .accessibilityLabel("Reminder enabled")
                    Text("Every \(task.reminderEveryDays)d")
                }
            }
            .font(.gh.caption)
            .foregroundStyle(Color.gh.inkQuiet)
        }
        .padding(GHSpacing.md)
        .background(Color.gh.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.gh.hairline, lineWidth: 1)
        )
    }

    private var statusVariant: GHBadge.Variant {
        switch task.status {
        case .todo: return .muted
        case .inProgress: return .info
        case .blocked: return .danger
        case .done: return .success
        }
    }

    private func dueLabel(_ dueDate: String) -> String {
        if task.status == .done { return "Due \(dueDate)" }
        let today = ISODateString.string(from: .now)
        return dueDate < today ? "Overdue \(dueDate)" : "Due \(dueDate)"
    }

    private func dueVariant(_ dueDate: String) -> GHBadge.Variant {
        if task.status == .done { return .muted }
        let today = ISODateString.string(from: .now)
        if dueDate < today { return .danger }
        let soon = ISODateString.string(from: Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now)
        return dueDate <= soon ? .warning : .muted
    }
}

private struct TaskEditorSheet: View {
    let task: TaskBoardTask?
    let members: [Member]
    let initialStatus: TaskStatus
    let onSaved: (_ saved: TaskBoardTask, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var descriptionText: String
    @State private var assigneeMemberId: String
    @State private var status: TaskStatus
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var reminderEnabled: Bool
    @State private var reminderEveryDays: Int
    @State private var saving = false
    @State private var error: String?

    private var assignableMembers: [Member] {
        members.filter(\.isTaskAssignable)
    }

    init(
        task: TaskBoardTask?,
        members: [Member],
        initialStatus: TaskStatus,
        onSaved: @escaping (_ saved: TaskBoardTask, _ shouldReload: Bool) -> Void
    ) {
        self.task = task
        self.members = members
        self.initialStatus = initialStatus
        self.onSaved = onSaved
        self._title = State(initialValue: task?.title ?? "")
        self._descriptionText = State(initialValue: task?.description ?? "")
        self._assigneeMemberId = State(initialValue: task?.assigneeMemberId ?? "")
        self._status = State(initialValue: task?.status ?? initialStatus)
        self._hasDueDate = State(initialValue: task?.dueDate != nil)
        self._dueDate = State(initialValue: ISODateString.date(from: task?.dueDate) ?? .now)
        self._reminderEnabled = State(initialValue: task?.reminderEnabled ?? true)
        self._reminderEveryDays = State(initialValue: task?.reminderEveryDays ?? 3)
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

                Section("Task") {
                    TextField("Title", text: $title)
                    TextField("Description", text: $descriptionText, axis: .vertical)
                        .lineLimit(3...8)
                    Picker("Assignee", selection: $assigneeMemberId) {
                        Text("Unassigned").tag("")
                        ForEach(assignableMembers) { member in
                            Text(member.fullName).tag(member.id)
                        }
                    }
                    Picker("Status", selection: $status) {
                        ForEach(TaskStatus.allCases) { status in
                            Label(status.displayName, systemImage: status.systemImage).tag(status)
                        }
                    }
                }

                Section("Deadline") {
                    Toggle("Due date", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Due", selection: $dueDate, displayedComponents: .date)
                    }
                }

                Section("Reminders") {
                    Toggle("Email reminders", isOn: $reminderEnabled)
                    Stepper(
                        "Every \(reminderEveryDays) day\(reminderEveryDays == 1 ? "" : "s") after deadline",
                        value: $reminderEveryDays,
                        in: 1...30
                    )
                    .disabled(!reminderEnabled)
                }
            }
            .navigationTitle(task == nil ? "New task" : "Edit task")
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
        .onAppear(perform: clearNonAssignableAssignee)
        .onChange(of: members) {
            clearNonAssignableAssignee()
        }
    }

    private func save() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            error = "Task title is required."
            return
        }

        saving = true
        defer { saving = false }
        error = nil
        clearNonAssignableAssignee()

        let payload = TaskMutationPayload(
            title: trimmedTitle,
            description: cleaned(descriptionText),
            assigneeMemberId: cleaned(assigneeMemberId),
            status: status,
            dueDate: hasDueDate ? ISODateString.string(from: dueDate) : nil,
            reminderEnabled: reminderEnabled,
            reminderEveryDays: reminderEveryDays
        )

        do {
            let op: PendingSyncOperation
            let savedId: String
            if let task, task.id.hasPrefix("local:") {
                let clientId = String(task.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                op = try sync.enqueue(
                    kind: .taskCreate,
                    title: "Create \(payload.title)",
                    payload: payload,
                    clientId: clientId
                )
                savedId = task.id
            } else if let task {
                op = try sync.enqueue(
                    kind: .taskUpdate,
                    title: "Update \(payload.title)",
                    payload: TaskUpdatePayload(taskId: task.id, task: payload)
                )
                savedId = task.id
            } else {
                op = try sync.enqueue(
                    kind: .taskCreate,
                    title: "Create \(payload.title)",
                    payload: payload
                )
                savedId = "local:\(op.clientId)"
            }

            let saved = makeTask(id: savedId, payload: payload)
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue task.")
        }
    }

    private func makeTask(id: String, payload: TaskMutationPayload) -> TaskBoardTask {
        let now = Date.now.timeIntervalSince1970 * 1000
        let assignee: TaskAssignee?
        if let assigneeId = payload.assigneeMemberId {
            assignee = assignableMembers.first { $0.id == assigneeId }.map {
                TaskAssignee(id: $0.id, firstName: $0.firstName, lastName: $0.lastName, email: $0.email)
            } ?? task?.assignee
        } else {
            assignee = nil
        }
        return TaskBoardTask(
            id: id,
            title: payload.title,
            description: payload.description,
            assigneeMemberId: payload.assigneeMemberId,
            status: payload.status,
            dueDate: payload.dueDate,
            order: task?.status == payload.status ? (task?.order ?? nextOrder(for: payload.status)) : nextOrder(for: payload.status),
            reminderEnabled: payload.reminderEnabled,
            reminderEveryDays: payload.reminderEveryDays,
            lastReminderQueuedAt: task?.lastReminderQueuedAt,
            createdBy: task?.createdBy,
            createdAt: task?.createdAt ?? now,
            updatedAt: now,
            completedAt: payload.status == .done ? now : nil,
            assignee: assignee,
            reminderStats: task?.reminderStats ?? TaskReminderStats(queued: 0, sent: 0, failed: 0, skipped: 0)
        )
    }

    private func updateCached(_ saved: TaskBoardTask) {
        var rows = (try? sync.store?.cachedTasks()) ?? []
        if let index = rows.firstIndex(where: { $0.id == saved.id }) {
            rows[index] = saved
        } else {
            rows.append(saved)
        }
        try? sync.store?.replaceTasks(rows)
    }

    private func nextOrder(for status: TaskStatus) -> Double {
        let rows = (try? sync.store?.cachedTasks()) ?? []
        return (rows.filter { $0.status == status }.map(\.order).max() ?? -1) + 1
    }

    private func clearNonAssignableAssignee() {
        guard !assigneeMemberId.isEmpty else { return }
        guard let selectedMember = members.first(where: { $0.id == assigneeMemberId }) else {
            if !members.isEmpty {
                assigneeMemberId = ""
            }
            return
        }
        if !selectedMember.isTaskAssignable {
            assigneeMemberId = ""
        }
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
