import SwiftUI

/// Member roster with offline-first create/edit support for field capture.
struct MembersListView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var members: [Member] = []
    @State private var loading = true
    @State private var error: String?
    @State private var isStale = false
    @State private var query = ""
    @State private var statusFilter: StatusFilter = .active
    @State private var volunteerOnly = false
    @State private var creatingMember = false
    @State private var editingMember: Member?

    init(canEdit: Bool = false) {
        self.canEdit = canEdit
    }

    enum StatusFilter: String, CaseIterable, Identifiable {
        case active = "Active only"
        case inactive = "Inactive only"
        case all = "Everyone"
        var id: String { rawValue }
    }

    private var filtered: [Member] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var rows = members
        switch statusFilter {
        case .active: rows = rows.filter { $0.status == .active }
        case .inactive: rows = rows.filter { $0.status == .inactive }
        case .all: break
        }
        if volunteerOnly { rows = rows.filter { $0.isVolunteer == true } }
        guard !q.isEmpty else { return rows }
        return rows.filter {
            $0.fullName.localizedStandardContains(q)
                || ($0.email ?? "").localizedStandardContains(q)
                || ($0.phone ?? "").localizedStandardContains(q)
                || ($0.clubRole ?? "").localizedStandardContains(q)
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
                    message: canEdit
                        ? "Add the first member from this device."
                        : "Members will appear here after they are added."
                )
            } else {
                list
            }
        }
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if canEdit {
                    Button {
                        creatingMember = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add member")
                }
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
                .accessibilityLabel("Filter members")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search name, email, phone"
        )
        .sheet(isPresented: $creatingMember) {
            MemberEditorSheet(member: nil) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .sheet(item: $editingMember) { member in
            MemberEditorSheet(member: member) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
    }

    private var list: some View {
        List(filtered) { member in
            NavigationLink {
                MemberDetailView(member: member, canEdit: canEdit) { saved, shouldReload in
                    upsertLocal(saved)
                    if shouldReload {
                        Task { await load() }
                    }
                }
            } label: {
                MemberRow(member: member)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if canEdit && !member.id.hasPrefix("local:") {
                    Button {
                        editingMember = member
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                    .tint(Color.gh.accent)
                }
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

    private func upsertLocal(_ member: Member) {
        if let index = members.firstIndex(where: { $0.id == member.id }) {
            members[index] = member
        } else {
            members.append(member)
            members.sort { $0.fullName < $1.fullName }
        }
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
                if let subtitle {
                    Text(subtitle)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                        .lineLimit(1)
                }
            }
            Spacer()
            if member.id.hasPrefix("local:") {
                GHBadge(text: "Queued", variant: .warning)
            } else if member.status == .inactive {
                GHBadge(text: "Inactive", variant: .muted)
            } else if member.isVolunteer == true {
                GHBadge(text: "Vol", variant: .info)
            }
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String? {
        if let email = member.email, !email.isEmpty { return email }
        if let phone = member.phone, !phone.isEmpty { return phone }
        if let clubRole = member.clubRole, !clubRole.isEmpty { return clubRole.capitalized }
        return nil
    }

    private var initials: String {
        let first = member.firstName.first.map { String($0) } ?? ""
        let last = member.lastName.first.map { String($0) } ?? ""
        return (first + last).uppercased()
    }
}

struct MemberDetailView: View {
    @State private var member: Member
    let canEdit: Bool
    let onSaved: (_ saved: Member, _ shouldReload: Bool) -> Void
    @State private var editing = false

    init(
        member: Member,
        canEdit: Bool = false,
        onSaved: @escaping (_ saved: Member, _ shouldReload: Bool) -> Void = { _, _ in }
    ) {
        self._member = State(initialValue: member)
        self.canEdit = canEdit
        self.onSaved = onSaved
    }

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
                if let dateOfBirth = member.dateOfBirth {
                    LabeledContent("Date of birth", value: dateOfBirth)
                }
            }
            Section("Organisation") {
                if let role = member.clubRole {
                    LabeledContent("Club role", value: role.capitalized)
                }
                LabeledContent("Volunteer", value: member.isVolunteer == true ? "Yes" : "No")
            }
            if let notes = member.notes, !notes.isEmpty {
                Section("Notes") {
                    Text(notes)
                }
            }
        }
        .navigationTitle(member.fullName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit && !member.id.hasPrefix("local:") {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { editing = true }
                }
            }
        }
        .sheet(isPresented: $editing) {
            MemberEditorSheet(member: member) { saved, shouldReload in
                member = saved
                onSaved(saved, shouldReload)
            }
        }
    }

    private var initials: String {
        let first = member.firstName.first.map { String($0) } ?? ""
        let last = member.lastName.first.map { String($0) } ?? ""
        return (first + last).uppercased()
    }
}

private struct MemberEditorSheet: View {
    let member: Member?
    let onSaved: (_ saved: Member, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var firstName: String
    @State private var lastName: String
    @State private var email: String
    @State private var phone: String
    @State private var dateOfBirth: String
    @State private var status: MemberStatus
    @State private var isVolunteer: Bool
    @State private var clubRole: String
    @State private var notes: String
    @State private var saving = false
    @State private var error: String?

    init(
        member: Member?,
        onSaved: @escaping (_ saved: Member, _ shouldReload: Bool) -> Void
    ) {
        self.member = member
        self.onSaved = onSaved
        self._firstName = State(initialValue: member?.firstName ?? "")
        self._lastName = State(initialValue: member?.lastName ?? "")
        self._email = State(initialValue: member?.email ?? "")
        self._phone = State(initialValue: member?.phone ?? "")
        self._dateOfBirth = State(initialValue: member?.dateOfBirth ?? "")
        self._status = State(initialValue: member?.status ?? .active)
        self._isVolunteer = State(initialValue: member?.isVolunteer ?? false)
        self._clubRole = State(initialValue: member?.clubRole ?? "")
        self._notes = State(initialValue: member?.notes ?? "")
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
                Section("Identity") {
                    TextField("First name", text: $firstName)
                        .textContentType(.givenName)
                    TextField("Last name", text: $lastName)
                        .textContentType(.familyName)
                    TextField("Date of birth (YYYY-MM-DD)", text: $dateOfBirth)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.numbersAndPunctuation)
                }
                Section("Contact") {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                    TextField("Phone", text: $phone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)
                }
                Section("Organisation") {
                    Picker("Status", selection: $status) {
                        ForEach(MemberStatus.allCases) { status in
                            Text(status.rawValue.capitalized).tag(status)
                        }
                    }
                    TextField("Club role", text: $clubRole)
                        .textInputAutocapitalization(.never)
                    Toggle("Volunteer", isOn: $isVolunteer)
                }
                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle(member == nil ? "New member" : "Edit member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving)
                }
            }
        }
    }

    private func save() async {
        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !first.isEmpty, !last.isEmpty else {
            error = "First and last name are required."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        let payload = MemberMutationPayload(
            firstName: first,
            lastName: last,
            email: cleaned(email),
            phone: cleaned(phone),
            dateOfBirth: cleaned(dateOfBirth),
            status: status,
            notes: cleaned(notes),
            isVolunteer: isVolunteer,
            clubRole: cleaned(clubRole)
        )

        do {
            let op: PendingSyncOperation
            let saved: Member
            if let member {
                op = try sync.enqueue(
                    kind: .memberUpdate,
                    title: "Update \(first) \(last)",
                    payload: MemberUpdatePayload(memberId: member.id, member: payload)
                )
                saved = makeMember(id: member.id, payload: payload)
                updateCachedMember(saved)
            } else {
                op = try sync.enqueue(
                    kind: .memberCreate,
                    title: "Create \(first) \(last)",
                    payload: payload
                )
                saved = makeMember(id: "local:\(op.clientId)", payload: payload)
                updateCachedMember(saved)
            }
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue member change.")
        }
    }

    private func makeMember(id: String, payload: MemberMutationPayload) -> Member {
        Member(
            id: id,
            firstName: payload.firstName,
            lastName: payload.lastName,
            email: payload.email,
            phone: payload.phone,
            dateOfBirth: payload.dateOfBirth,
            status: payload.status,
            notes: payload.notes,
            isVolunteer: payload.isVolunteer,
            clubRole: payload.clubRole
        )
    }

    private func updateCachedMember(_ member: Member) {
        var rows = (try? sync.store?.cachedMembers()) ?? []
        if let index = rows.firstIndex(where: { $0.id == member.id }) {
            rows[index] = member
        } else {
            rows.append(member)
        }
        rows.sort { $0.fullName < $1.fullName }
        try? sync.store?.replaceMembers(rows)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
