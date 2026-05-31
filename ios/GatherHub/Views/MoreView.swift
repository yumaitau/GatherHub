import SwiftUI

/// "More" tab — dense, grouped index of every surface that does not
/// warrant a dedicated tab. Sections appear conditionally based on the
/// active org's mode and the caller's role.
///
/// Most rows currently route to a placeholder so the menu can ship
/// alongside the field-ops surfaces (scan + events) and the placeholder
/// destinations get backfilled feature-by-feature.
struct MoreView: View {
    let context: CurrentContext
    @EnvironmentObject private var sync: SyncEnvironment

    var body: some View {
        NavigationStack {
            List {
                operationsSection
                if context.role.canManageOrgSettings {
                    adminSection
                }
                if context.org.soccerMode == true {
                    soccerSection
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("More")
            .safeAreaInset(edge: .bottom) { adminFootnote }
        }
    }

    // MARK: Sections

    /// Items the field-ops user actually reaches for with the phone in
    /// hand. Everything else (volunteers, sponsors, news, public site,
    /// reference taxonomies, settings, invitations, audit log) lives on
    /// the web admin — adding it here would dilute the field surface.
    private var operationsSection: some View {
        Section("Operations") {
            row("Members", system: "person.2") {
                MembersListView(
                    canEdit: context.role.canManageMembers,
                    canDelete: context.role.canDeleteAdministrativeRecords
                )
            }
            row("Teams", system: "shield.lefthalf.filled") {
                TeamsListView(
                    canEdit: context.role.canManageTeams,
                    canDelete: context.role.canDeleteAdministrativeRecords,
                    soccerMode: context.org.soccerMode == true
                )
            }
            row("Announcements", system: "megaphone") {
                AnnouncementsListView(
                    canEdit: context.role.canManageEvents,
                    canCreateOrgWide: context.role.canCreateOrgAnnouncements
                )
            }
            NavigationLink {
                PendingQueueView()
            } label: {
                HStack {
                    Label("Sync queue", systemImage: "arrow.triangle.2.circlepath")
                    Spacer()
                    let count = sync.coordinator?.unsettledCount ?? 0
                    if count > 0 {
                        Text("\(count)")
                            .font(.gh.caption.weight(.semibold))
                            .foregroundStyle(Color.gh.accent)
                    }
                }
            }
        }
    }

    private var soccerSection: some View {
        Section("Soccer") {
            row("Player registrations", system: "list.clipboard") {
                SoccerRegistrationsView(canEdit: context.role.canManageSoccerSetup)
            }
            row("Coaches & managers", system: "person.crop.rectangle.stack") {
                CoachesManagersView()
            }
            row("Grading", system: "gauge.with.dots.needle.67percent") {
                GradingListView()
            }
            row("Age groups", system: "person.3.sequence") {
                AgeGroupsListView(canEdit: context.role.canManageSoccerSetup)
            }
            row("Competitions", system: "trophy") {
                SoccerCompetitionsListView(canEdit: context.role.canManageSoccerSetup)
            }
            row("Divisions", system: "square.3.layers.3d") {
                SoccerDivisionsListView(canEdit: context.role.canManageSoccerSetup)
            }
            row("Grading skills", system: "slider.horizontal.3") {
                SoccerSkillsListView(canEdit: context.role.canManageSoccerSetup)
            }
        }
    }

    private var adminSection: some View {
        Section("Admin") {
            row("Organisation address", system: "mappin.and.ellipse") {
                OrganizationAddressView(initialAddress: context.org.defaultAddress)
            }
        }
    }

    /// Honest footnote so admins know where to go for the surfaces that
    /// intentionally don't ship on iOS.
    private var adminFootnote: some View {
        VStack(spacing: GHSpacing.xs) {
            Text("Full admin lives on the web.").ghLabelStyle()
            Text("Sponsors, news, invitations and audit logs are configured at app.gatherhub.au.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
                .multilineTextAlignment(.center)
                .padding(.horizontal, GHSpacing.pageInset)
        }
        .padding(.vertical, GHSpacing.lg)
        .frame(maxWidth: .infinity)
        .background(Color.gh.surfaceSunk.opacity(0.5))
    }

    // MARK: Row helper

    @ViewBuilder
    private func row<Destination: View>(
        _ title: String,
        system: String,
        @ViewBuilder destination: () -> Destination
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            Label(title, systemImage: system)
        }
    }
}

/// Placeholder destination for "More" rows whose feature has not landed
/// in the iOS app yet. Keeps the menu navigable so we can spec the
/// remaining surfaces incrementally.
struct MorePlaceholderView: View {
    let title: String
    let description: String

    var body: some View {
        VStack(spacing: GHSpacing.xl) {
            Image(systemName: "tray.full")
                .font(.system(size: 32, weight: .regular))
                .foregroundStyle(Color.gh.inkQuiet)
            Text(title)
                .font(.gh.headline)
                .foregroundStyle(Color.gh.inkStrong)
            Text(description)
                .font(.gh.body)
                .foregroundStyle(Color.gh.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
            Text("Coming to iOS soon — use the web admin for now.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
        }
        .padding(GHSpacing.huge)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.gh.paper.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AgeGroupsListView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [TaxonomyOption] = []
    @State private var loading = true
    @State private var error: String?
    @State private var creating = false
    @State private var editing: TaxonomyOption?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading age groups…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(title: "Couldn't load age groups", message: error, retry: load)
            } else if rows.isEmpty {
                EmptyStateView(
                    title: "No age groups",
                    systemImage: "person.3.sequence",
                    message: canEdit ? "Add the first age group from this device." : "Age groups will appear here."
                )
            } else {
                List(rows) { row in
                    Button {
                        if canEdit { editing = row }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.label)
                                    .font(.gh.bodyStrong)
                                    .foregroundStyle(Color.gh.inkStrong)
                                Text(row.key)
                                    .font(.gh.caption)
                                    .foregroundStyle(Color.gh.inkQuiet)
                                    .monospaced()
                            }
                            Spacer()
                            if row.id.hasPrefix("local:") {
                                GHBadge(text: "Queued", variant: .warning)
                            } else if row.active == false {
                                GHBadge(text: "Inactive", variant: .muted)
                            } else if row.isDefault {
                                GHBadge(text: "Default", variant: .info)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(!canEdit)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Age groups")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        creating = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add age group")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $creating) {
            AgeGroupEditorSheet(row: nil) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .sheet(item: $editing) { row in
            AgeGroupEditorSheet(row: row) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
    }

    private func load() async {
        let hasCached = (try? sync.store?.hasCachedTeamAgeGroups()) ?? false
        if hasCached {
            rows = (try? sync.store?.cachedTeamAgeGroups()) ?? []
            loading = false
        } else if rows.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listTeamAgeGroups(includeInactive: true)
            rows = fresh
            try? sync.store?.replaceTeamAgeGroups(fresh)
        } catch let err {
            if !hasCached && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load age groups.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ row: TaxonomyOption) {
        if let index = rows.firstIndex(where: { $0.id == row.id }) {
            rows[index] = row
        } else {
            rows.append(row)
        }
        rows.sort { ($0.order ?? 0) < ($1.order ?? 0) }
    }
}

private struct AgeGroupEditorSheet: View {
    let row: TaxonomyOption?
    let onSaved: (_ saved: TaxonomyOption, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var label: String
    @State private var active: Bool
    @State private var saving = false
    @State private var error: String?

    init(
        row: TaxonomyOption?,
        onSaved: @escaping (_ saved: TaxonomyOption, _ shouldReload: Bool) -> Void
    ) {
        self.row = row
        self.onSaved = onSaved
        self._label = State(initialValue: row?.label ?? "")
        self._active = State(initialValue: row?.active ?? true)
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
                Section("Age group") {
                    TextField("Label", text: $label)
                    if row != nil {
                        Toggle("Active", isOn: $active)
                    }
                }
            }
            .navigationTitle(row == nil ? "New age group" : "Edit age group")
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
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            error = "Label is required."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        do {
            var trackedOps: [PendingSyncOperation] = []
            let saved: TaxonomyOption
            if let row {
                if row.label != trimmed {
                    let op = try sync.enqueue(
                        kind: .teamAgeGroupUpdate,
                        title: "Update age group \(trimmed)",
                        payload: AgeGroupUpdatePayload(id: row.id, label: trimmed)
                    )
                    trackedOps.append(op)
                }
                if (row.active ?? true) != active {
                    let op = try sync.enqueue(
                        kind: .teamAgeGroupSetActive,
                        title: "\(active ? "Activate" : "Deactivate") \(trimmed)",
                        payload: AgeGroupActivePayload(id: row.id, active: active)
                    )
                    trackedOps.append(op)
                }
                saved = TaxonomyOption(
                    id: row.id,
                    kind: row.kind,
                    key: row.key,
                    label: trimmed,
                    isDefault: row.isDefault,
                    order: row.order,
                    active: active,
                    color: row.color
                )
            } else {
                let op = try sync.enqueue(
                    kind: .teamAgeGroupCreate,
                    title: "Create age group \(trimmed)",
                    payload: AgeGroupMutationPayload(label: trimmed)
                )
                trackedOps.append(op)
                saved = TaxonomyOption(
                    id: "local:\(op.clientId)",
                    kind: "team_age_group",
                    key: slug(for: trimmed),
                    label: trimmed,
                    isDefault: false,
                    order: nil,
                    active: true,
                    color: nil
                )
            }
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, trackedOps.contains { $0.status == .applied })
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue age group change.")
        }
    }

    private func updateCached(_ row: TaxonomyOption) {
        var rows = (try? sync.store?.cachedTeamAgeGroups()) ?? []
        if let index = rows.firstIndex(where: { $0.id == row.id }) {
            rows[index] = row
        } else {
            rows.append(row)
        }
        try? sync.store?.replaceTeamAgeGroups(rows)
    }

    private func slug(for label: String) -> String {
        label.lowercased()
            .split { !$0.isLetter && !$0.isNumber }
            .joined(separator: "_")
    }
}

struct SoccerDivisionsListView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [SoccerDivision] = []
    @State private var loading = true
    @State private var error: String?
    @State private var creating = false
    @State private var editing: SoccerDivision?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading divisions…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(title: "Couldn't load divisions", message: error, retry: load)
            } else if rows.isEmpty {
                EmptyStateView(
                    title: "No divisions",
                    systemImage: "square.3.layers.3d",
                    message: canEdit ? "Add the first grading division from this device." : "Divisions will appear here."
                )
            } else {
                List(rows) { division in
                    Button {
                        if canEdit { editing = division }
                    } label: {
                        HStack(spacing: GHSpacing.md) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color(hexString: division.color) ?? Color.gh.accentWash)
                                .frame(width: 18, height: 18)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(division.name)
                                    .font(.gh.bodyStrong)
                                    .foregroundStyle(Color.gh.inkStrong)
                                Text("\(division.minGrade.formatted(.number.precision(.fractionLength(0...2)))) - \(division.maxGrade.formatted(.number.precision(.fractionLength(0...2))))")
                                    .font(.gh.caption)
                                    .foregroundStyle(Color.gh.inkQuiet)
                            }
                            Spacer()
                            if division.id.hasPrefix("local:") {
                                GHBadge(text: "Queued", variant: .warning)
                            } else if !division.active {
                                GHBadge(text: "Inactive", variant: .muted)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(!canEdit)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Divisions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        creating = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add division")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $creating) {
            DivisionEditorSheet(division: nil) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .sheet(item: $editing) { division in
            DivisionEditorSheet(division: division) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
    }

    private func load() async {
        let hasCached = (try? sync.store?.hasCachedSoccerDivisions()) ?? false
        if hasCached {
            rows = (try? sync.store?.cachedSoccerDivisions()) ?? []
            loading = false
        } else if rows.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listSoccerDivisions()
            rows = fresh
            try? sync.store?.replaceSoccerDivisions(fresh)
        } catch let err {
            if !hasCached && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load divisions.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ division: SoccerDivision) {
        if let index = rows.firstIndex(where: { $0.id == division.id }) {
            rows[index] = division
        } else {
            rows.append(division)
        }
    }
}

private struct DivisionEditorSheet: View {
    let division: SoccerDivision?
    let onSaved: (_ saved: SoccerDivision, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var minGrade: Double
    @State private var maxGrade: Double
    @State private var color: String
    @State private var active: Bool
    @State private var saving = false
    @State private var error: String?

    init(
        division: SoccerDivision?,
        onSaved: @escaping (_ saved: SoccerDivision, _ shouldReload: Bool) -> Void
    ) {
        self.division = division
        self.onSaved = onSaved
        self._name = State(initialValue: division?.name ?? "")
        self._minGrade = State(initialValue: division?.minGrade ?? 0)
        self._maxGrade = State(initialValue: division?.maxGrade ?? 100)
        self._color = State(initialValue: division?.color ?? "#0891b2")
        self._active = State(initialValue: division?.active ?? true)
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
                Section("Division") {
                    TextField("Name", text: $name)
                    TextField("Minimum grade", value: $minGrade, format: .number)
                        .keyboardType(.decimalPad)
                    TextField("Maximum grade", value: $maxGrade, format: .number)
                        .keyboardType(.decimalPad)
                    TextField("Colour", text: $color)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if division != nil {
                        Toggle("Active", isOn: $active)
                    }
                }
            }
            .navigationTitle(division == nil ? "New division" : "Edit division")
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
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            error = "Name is required."
            return
        }
        guard minGrade <= maxGrade else {
            error = "Minimum grade must be less than or equal to maximum grade."
            return
        }
        saving = true
        defer { saving = false }
        error = nil
        let payload = DivisionMutationPayload(
            id: division?.id,
            name: trimmed,
            minGrade: minGrade,
            maxGrade: maxGrade,
            color: cleaned(color),
            active: active
        )
        do {
            let op = try sync.enqueue(
                kind: .soccerDivision,
                title: "\(division == nil ? "Create" : "Update") \(trimmed)",
                payload: payload
            )
            let saved = SoccerDivision(
                id: division?.id ?? "local:\(op.clientId)",
                name: trimmed,
                minGrade: minGrade,
                maxGrade: maxGrade,
                color: cleaned(color),
                active: active
            )
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue division change.")
        }
    }

    private func updateCached(_ division: SoccerDivision) {
        var rows = (try? sync.store?.cachedSoccerDivisions()) ?? []
        if let index = rows.firstIndex(where: { $0.id == division.id }) {
            rows[index] = division
        } else {
            rows.append(division)
        }
        try? sync.store?.replaceSoccerDivisions(rows)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

struct SoccerCompetitionsListView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [SoccerCompetition] = []
    @State private var loading = true
    @State private var error: String?
    @State private var creating = false
    @State private var editing: SoccerCompetition?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading competitions...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(title: "Couldn't load competitions", message: error, retry: load)
            } else if rows.isEmpty {
                EmptyStateView(
                    title: "No competitions",
                    systemImage: "trophy",
                    message: canEdit ? "Add the first competition from this device." : "Competitions will appear here."
                )
            } else {
                List(rows) { competition in
                    Button {
                        if canEdit { editing = competition }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(competition.name)
                                    .font(.gh.bodyStrong)
                                    .foregroundStyle(Color.gh.inkStrong)
                                if let season = competition.season {
                                    Text(season)
                                        .font(.gh.caption)
                                        .foregroundStyle(Color.gh.inkQuiet)
                                }
                            }
                            Spacer()
                            if competition.id.hasPrefix("local:") {
                                GHBadge(text: "Queued", variant: .warning)
                            } else if !competition.active {
                                GHBadge(text: "Inactive", variant: .muted)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(!canEdit)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Competitions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        creating = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add competition")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $creating) {
            CompetitionEditorSheet(competition: nil) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .sheet(item: $editing) { competition in
            CompetitionEditorSheet(competition: competition) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
    }

    private func load() async {
        let hasCached = (try? sync.store?.hasCachedSoccerCompetitions()) ?? false
        if hasCached {
            rows = (try? sync.store?.cachedSoccerCompetitions()) ?? []
            loading = false
        } else if rows.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listSoccerCompetitions()
            rows = fresh
            try? sync.store?.replaceSoccerCompetitions(fresh)
        } catch let err {
            if !hasCached && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load competitions.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ competition: SoccerCompetition) {
        if let index = rows.firstIndex(where: { $0.id == competition.id }) {
            rows[index] = competition
        } else {
            rows.append(competition)
        }
        try? sync.store?.replaceSoccerCompetitions(rows)
    }
}

private struct CompetitionEditorSheet: View {
    let competition: SoccerCompetition?
    let onSaved: (_ saved: SoccerCompetition, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var season: String
    @State private var active: Bool
    @State private var saving = false
    @State private var error: String?

    init(
        competition: SoccerCompetition?,
        onSaved: @escaping (_ saved: SoccerCompetition, _ shouldReload: Bool) -> Void
    ) {
        self.competition = competition
        self.onSaved = onSaved
        self._name = State(initialValue: competition?.name ?? "")
        self._season = State(initialValue: competition?.season ?? "")
        self._active = State(initialValue: competition?.active ?? true)
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
                Section("Competition") {
                    TextField("Name", text: $name)
                    TextField("Season", text: $season)
                    if competition != nil {
                        Toggle("Active", isOn: $active)
                    }
                }
            }
            .navigationTitle(competition == nil ? "New competition" : "Edit competition")
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
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            error = "Name is required."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        let payload = CompetitionMutationPayload(
            id: competition?.id,
            name: trimmed,
            season: cleaned(season),
            active: active
        )

        do {
            let op = try sync.enqueue(
                kind: .soccerCompetition,
                title: "\(competition == nil ? "Create" : "Update") \(trimmed)",
                payload: payload
            )
            let saved = SoccerCompetition(
                id: competition?.id ?? "local:\(op.clientId)",
                name: trimmed,
                season: payload.season,
                active: active
            )
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue competition change.")
        }
    }

    private func updateCached(_ competition: SoccerCompetition) {
        var rows = (try? sync.store?.cachedSoccerCompetitions()) ?? []
        if let index = rows.firstIndex(where: { $0.id == competition.id }) {
            rows[index] = competition
        } else {
            rows.append(competition)
        }
        try? sync.store?.replaceSoccerCompetitions(rows)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

struct SoccerSkillsListView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [SoccerSkill] = []
    @State private var loading = true
    @State private var error: String?
    @State private var creating = false
    @State private var editing: SoccerSkill?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading skills...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(title: "Couldn't load skills", message: error, retry: load)
            } else if rows.isEmpty {
                EmptyStateView(
                    title: "No skills",
                    systemImage: "slider.horizontal.3",
                    message: canEdit ? "Add the first grading skill from this device." : "Skills will appear here."
                )
            } else {
                List(rows) { skill in
                    Button {
                        if canEdit { editing = skill }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(skill.name)
                                    .font(.gh.bodyStrong)
                                    .foregroundStyle(Color.gh.inkStrong)
                                Text("Weight \(skill.weight.formatted(.number.precision(.fractionLength(0...2)))) - Max \(skill.maxScore.formatted(.number.precision(.fractionLength(0...2))))")
                                    .font(.gh.caption)
                                    .foregroundStyle(Color.gh.inkQuiet)
                            }
                            Spacer()
                            if skill.id.hasPrefix("local:") {
                                GHBadge(text: "Queued", variant: .warning)
                            } else if !skill.active {
                                GHBadge(text: "Inactive", variant: .muted)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(!canEdit)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Grading skills")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        creating = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add grading skill")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $creating) {
            SkillEditorSheet(skill: nil) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .sheet(item: $editing) { skill in
            SkillEditorSheet(skill: skill) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
    }

    private func load() async {
        let hasCached = (try? sync.store?.hasCachedSoccerSkills()) ?? false
        if hasCached {
            rows = (try? sync.store?.cachedSoccerSkills()) ?? []
            loading = false
        } else if rows.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listSoccerSkills(includeInactive: true)
            rows = fresh
            try? sync.store?.replaceSoccerSkills(fresh)
        } catch let err {
            if !hasCached && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load skills.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ skill: SoccerSkill) {
        if let index = rows.firstIndex(where: { $0.id == skill.id }) {
            rows[index] = skill
        } else {
            rows.append(skill)
        }
        rows.sort { $0.order < $1.order }
        try? sync.store?.replaceSoccerSkills(rows)
    }
}

private struct SkillEditorSheet: View {
    let skill: SoccerSkill?
    let onSaved: (_ saved: SoccerSkill, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var description: String
    @State private var weight: Double
    @State private var maxScore: Double
    @State private var active: Bool
    @State private var saving = false
    @State private var error: String?

    init(
        skill: SoccerSkill?,
        onSaved: @escaping (_ saved: SoccerSkill, _ shouldReload: Bool) -> Void
    ) {
        self.skill = skill
        self.onSaved = onSaved
        self._name = State(initialValue: skill?.name ?? "")
        self._description = State(initialValue: skill?.description ?? "")
        self._weight = State(initialValue: skill?.weight ?? 0.1)
        self._maxScore = State(initialValue: skill?.maxScore ?? 10)
        self._active = State(initialValue: skill?.active ?? true)
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
                Section("Skill") {
                    TextField("Name", text: $name)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                    TextField("Weight", value: $weight, format: .number)
                        .keyboardType(.decimalPad)
                    TextField("Max score", value: $maxScore, format: .number)
                        .keyboardType(.decimalPad)
                    if skill != nil {
                        Toggle("Active", isOn: $active)
                    }
                }
            }
            .navigationTitle(skill == nil ? "New skill" : "Edit skill")
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
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            error = "Name is required."
            return
        }
        guard weight > 0 else {
            error = "Weight must be greater than zero."
            return
        }
        guard maxScore > 0 else {
            error = "Max score must be greater than zero."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        let payload = SkillMutationPayload(
            name: trimmed,
            description: cleaned(description),
            weight: weight,
            maxScore: maxScore,
            active: active
        )

        do {
            let op: PendingSyncOperation
            let saved: SoccerSkill
            if let skill {
                op = try sync.enqueue(
                    kind: .soccerSkillUpdate,
                    title: "Update \(trimmed)",
                    payload: SkillUpdatePayload(skillId: skill.id, skill: payload)
                )
                saved = SoccerSkill(
                    id: skill.id,
                    name: payload.name,
                    description: payload.description,
                    weight: payload.weight,
                    maxScore: payload.maxScore,
                    order: skill.order,
                    active: payload.active
                )
            } else {
                op = try sync.enqueue(
                    kind: .soccerSkillCreate,
                    title: "Create \(trimmed)",
                    payload: payload
                )
                saved = SoccerSkill(
                    id: "local:\(op.clientId)",
                    name: payload.name,
                    description: payload.description,
                    weight: payload.weight,
                    maxScore: payload.maxScore,
                    order: nextOrder(),
                    active: true
                )
            }
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue skill change.")
        }
    }

    private func updateCached(_ skill: SoccerSkill) {
        var rows = (try? sync.store?.cachedSoccerSkills()) ?? []
        if let index = rows.firstIndex(where: { $0.id == skill.id }) {
            rows[index] = skill
        } else {
            rows.append(skill)
        }
        rows.sort { $0.order < $1.order }
        try? sync.store?.replaceSoccerSkills(rows)
    }

    private func nextOrder() -> Double {
        let rows = (try? sync.store?.cachedSoccerSkills()) ?? []
        return (rows.map(\.order).max() ?? -1) + 1
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension Color {
    init?(hexString: String?) {
        guard let hexString else { return nil }
        let cleaned = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else {
            return nil
        }
        let red = Double((value >> 16) & 0xff) / 255
        let green = Double((value >> 8) & 0xff) / 255
        let blue = Double(value & 0xff) / 255
        self.init(red: red, green: green, blue: blue)
    }
}
