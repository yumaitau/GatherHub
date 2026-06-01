import SwiftUI

struct TrainingCertificationsListView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment

    @State private var rows: [TrainingCertificationRow] = []
    @State private var members: [Member] = []
    @State private var loading = true
    @State private var error: String?
    @State private var search = ""
    @State private var creating = false
    @State private var editing: TrainingCertificationRow?
    @State private var deleting: TrainingCertificationRow?

    private var filteredRows: [TrainingCertificationRow] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return rows }
        return rows.filter { row in
            [
                row.cert.name,
                row.cert.issuer,
                row.memberName,
                row.cert.expiryDate,
                row.cert.notes,
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
                    title: "Couldn't load training",
                    message: error,
                    retry: load
                )
            } else if rows.isEmpty {
                EmptyStateView(
                    title: "No training records",
                    systemImage: "graduationcap",
                    message: canEdit ? "Add the first certification from this device." : "Training records will appear here."
                )
            } else {
                List(filteredRows) { row in
                    Button {
                        if canEdit { editing = row }
                    } label: {
                        TrainingCertificationRowView(row: row)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canEdit)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if canEdit {
                            Button {
                                editing = row
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(Color.gh.accent)

                            Button(role: .destructive) {
                                deleting = row
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .searchable(text: $search, prompt: "Search training")
            }
        }
        .navigationTitle("Training")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        creating = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add training record")
                    .disabled(members.isEmpty)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $creating) {
            TrainingCertificationEditorSheet(
                row: nil,
                members: members
            ) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload { Task { await load() } }
            }
        }
        .sheet(item: $editing) { row in
            TrainingCertificationEditorSheet(
                row: row,
                members: members
            ) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload { Task { await load() } }
            }
        }
        .confirmationDialog(
            "Delete this training record?",
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
                Text(row.cert.name)
            }
        }
    }

    private func load() async {
        let hasCachedRows = (try? sync.store?.hasCachedTrainingCertifications()) ?? false
        let hasCachedMembers = (try? sync.store?.hasCachedMembers()) ?? false
        if hasCachedRows {
            rows = (try? sync.store?.cachedTrainingCertifications()) ?? []
            loading = false
        } else if rows.isEmpty {
            loading = true
        }
        if hasCachedMembers {
            members = (try? sync.store?.cachedMembers()) ?? []
        }
        error = nil

        do {
            async let certsTask = convex.listTrainingCertifications()
            async let membersTask = convex.listMembers()
            let (freshRows, freshMembers) = try await (certsTask, membersTask)
            rows = freshRows
            members = freshMembers
            try? sync.store?.replaceTrainingCertifications(freshRows)
            try? sync.store?.replaceMembers(freshMembers)
        } catch let err {
            if !hasCachedRows && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load training records.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ row: TrainingCertificationRow) {
        if let index = rows.firstIndex(where: { $0.id == row.id }) {
            rows[index] = row
        } else {
            rows.insert(row, at: 0)
        }
        rows = sortRows(rows)
        try? sync.store?.replaceTrainingCertifications(rows)
    }

    private func removeLocal(_ id: String) {
        rows.removeAll { $0.id == id }
        try? sync.store?.replaceTrainingCertifications(rows)
    }

    private func delete(_ row: TrainingCertificationRow) async {
        deleting = nil
        do {
            if row.id.hasPrefix("local:") {
                let clientId = String(row.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                removeLocal(row.id)
                sync.coordinator?.refreshUnsettledCount()
                return
            }

            let op = try sync.enqueue(
                kind: .trainingCertificationDelete,
                title: "Delete \(row.cert.name)",
                payload: TrainingCertificationDeletePayload(certId: row.id)
            )
            removeLocal(row.id)
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load()
            }
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue training deletion.")
        }
    }

    private func sortRows(_ rows: [TrainingCertificationRow]) -> [TrainingCertificationRow] {
        rows.sorted {
            let expiry = ($0.cert.expiryDate ?? "9999").compare($1.cert.expiryDate ?? "9999")
            if expiry != .orderedSame { return expiry == .orderedAscending }
            return $0.cert.name.localizedCaseInsensitiveCompare($1.cert.name) == .orderedAscending
        }
    }
}

private struct TrainingCertificationRowView: View {
    let row: TrainingCertificationRow

    private var expiryState: GHBadge.Variant? {
        guard let expiry = row.cert.expiryDate else { return nil }
        let today = ISODateString.string(from: .now)
        if expiry < today { return .danger }
        let soon = ISODateString.string(from: Calendar.current.date(byAdding: .day, value: 60, to: .now) ?? .now)
        return expiry <= soon ? .warning : .success
    }

    var body: some View {
        HStack(alignment: .top, spacing: GHSpacing.md) {
            Image(systemName: "graduationcap")
                .font(.gh.body)
                .foregroundStyle(Color.gh.accent)
                .frame(width: 28, height: 28)
                .background(Color.gh.accentWash, in: Circle())
            VStack(alignment: .leading, spacing: GHSpacing.xs) {
                HStack(spacing: GHSpacing.sm) {
                    Text(row.cert.name)
                        .font(.gh.bodyStrong)
                        .foregroundStyle(Color.gh.inkStrong)
                        .lineLimit(1)
                    if row.id.hasPrefix("local:") {
                        GHBadge(text: "Queued", variant: .warning)
                    }
                }
                Text(row.memberName)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
                HStack(spacing: GHSpacing.sm) {
                    if let issuer = row.cert.issuer {
                        Text(issuer)
                    }
                    if let expiry = row.cert.expiryDate {
                        Text("Expires \(expiry)")
                    }
                }
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
                if let variant = expiryState, let expiry = row.cert.expiryDate {
                    GHBadge(text: expiry < ISODateString.string(from: .now) ? "Expired" : "Current", variant: variant)
                }
            }
            Spacer(minLength: GHSpacing.sm)
        }
        .padding(.vertical, 4)
    }
}

private struct TrainingCertificationEditorSheet: View {
    let row: TrainingCertificationRow?
    let members: [Member]
    let onSaved: (_ saved: TrainingCertificationRow, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var memberId: String
    @State private var name: String
    @State private var issuer: String
    @State private var hasIssuedDate: Bool
    @State private var issuedDate: Date
    @State private var hasExpiryDate: Bool
    @State private var expiryDate: Date
    @State private var notes: String
    @State private var saving = false
    @State private var error: String?

    init(
        row: TrainingCertificationRow?,
        members: [Member],
        onSaved: @escaping (_ saved: TrainingCertificationRow, _ shouldReload: Bool) -> Void
    ) {
        self.row = row
        self.members = members
        self.onSaved = onSaved
        let issued = ISODateString.date(from: row?.cert.issuedDate) ?? .now
        let expiry = ISODateString.date(from: row?.cert.expiryDate) ?? .now
        self._memberId = State(initialValue: row?.cert.memberId ?? members.first?.id ?? "")
        self._name = State(initialValue: row?.cert.name ?? "")
        self._issuer = State(initialValue: row?.cert.issuer ?? "")
        self._hasIssuedDate = State(initialValue: row?.cert.issuedDate != nil)
        self._issuedDate = State(initialValue: issued)
        self._hasExpiryDate = State(initialValue: row?.cert.expiryDate != nil)
        self._expiryDate = State(initialValue: expiry)
        self._notes = State(initialValue: row?.cert.notes ?? "")
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

                Section("Member") {
                    Picker("Member", selection: $memberId) {
                        ForEach(members) { member in
                            Text(member.fullName).tag(member.id)
                        }
                    }
                    .disabled(members.isEmpty)
                }

                Section("Training") {
                    TextField("Certification name", text: $name)
                    TextField("Issuer", text: $issuer)
                    Toggle("Issued date", isOn: $hasIssuedDate)
                    if hasIssuedDate {
                        DatePicker("Issued", selection: $issuedDate, displayedComponents: .date)
                    }
                    Toggle("Expiry date", isOn: $hasExpiryDate)
                    if hasExpiryDate {
                        DatePicker("Expires", selection: $expiryDate, displayedComponents: .date)
                    }
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle(row == nil ? "New training" : "Edit training")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving || members.isEmpty)
                }
            }
        }
    }

    private func save() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !memberId.isEmpty else {
            error = "Choose a member."
            return
        }
        guard !trimmedName.isEmpty else {
            error = "Certification name is required."
            return
        }

        saving = true
        defer { saving = false }
        error = nil

        let payload = TrainingCertificationMutationPayload(
            memberId: memberId,
            name: trimmedName,
            issuer: cleaned(issuer),
            issuedDate: hasIssuedDate ? ISODateString.string(from: issuedDate) : nil,
            expiryDate: hasExpiryDate ? ISODateString.string(from: expiryDate) : nil,
            notes: cleaned(notes)
        )

        do {
            let op: PendingSyncOperation
            let savedId: String
            if let row, row.id.hasPrefix("local:") {
                let clientId = String(row.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                op = try sync.enqueue(
                    kind: .trainingCertificationCreate,
                    title: "Create \(payload.name)",
                    payload: payload,
                    clientId: clientId
                )
                savedId = row.id
            } else if let row {
                op = try sync.enqueue(
                    kind: .trainingCertificationUpdate,
                    title: "Update \(payload.name)",
                    payload: TrainingCertificationUpdatePayload(
                        certId: row.id,
                        certification: payload
                    )
                )
                savedId = row.id
            } else {
                op = try sync.enqueue(
                    kind: .trainingCertificationCreate,
                    title: "Create \(payload.name)",
                    payload: payload
                )
                savedId = "local:\(op.clientId)"
            }

            let saved = makeRow(id: savedId, payload: payload)
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue training record.")
        }
    }

    private func makeRow(
        id: String,
        payload: TrainingCertificationMutationPayload
    ) -> TrainingCertificationRow {
        TrainingCertificationRow(
            cert: TrainingCertification(
                id: id,
                memberId: payload.memberId,
                name: payload.name,
                issuer: payload.issuer,
                issuedDate: payload.issuedDate,
                expiryDate: payload.expiryDate,
                notes: payload.notes
            ),
            member: members.first { $0.id == payload.memberId } ?? row?.member
        )
    }

    private func updateCached(_ saved: TrainingCertificationRow) {
        var rows = (try? sync.store?.cachedTrainingCertifications()) ?? []
        if let index = rows.firstIndex(where: { $0.id == saved.id }) {
            rows[index] = saved
        } else {
            rows.insert(saved, at: 0)
        }
        try? sync.store?.replaceTrainingCertifications(rows)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
