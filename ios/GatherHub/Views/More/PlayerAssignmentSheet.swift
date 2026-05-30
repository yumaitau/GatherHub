import SwiftUI

/// Quick assignment sheet — slide-up from the player registrations
/// list. Lets the user set team, division, and kit colour without
/// leaving the row. Mirrors the web RegistrationDialog's three
/// assignment fields but skips the rest of the registration form,
/// since the typical mobile use case is "fix one of these on the
/// sideline".
///
/// Division picker has an "Auto (from grade)" sentinel: choosing it
/// sends `clearDivision: true` so the backend's grade-band fallback
/// matches the player into whichever division their score lands in.
struct PlayerAssignmentSheet: View {
    let row: PlayerListingRow
    let onSaved: () -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var teams: [Team] = []
    @State private var divisions: [SoccerDivision] = []
    @State private var loading = true
    @State private var error: String?

    @State private var teamId: String = ""
    /// "" means "Auto (from grade)" — sentinel for clearDivision = true.
    @State private var divisionId: String = ""
    @State private var kitColour: String = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Loading options…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    OfflineStateView(
                        title: "Couldn't load",
                        message: error,
                        retry: load
                    )
                } else {
                    form
                }
            }
            .background(Color.gh.paper.ignoresSafeArea())
            .navigationTitle("Assign · \(row.name)")
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
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var form: some View {
        Form {
            Section {
                Picker("Team", selection: $teamId) {
                    Text("Unassigned").tag("")
                    ForEach(teams) { t in
                        Text(t.name).tag(t.id)
                    }
                }
            } footer: {
                Text("Inheriting kit colour from this team when no override is set.")
                    .font(.gh.caption)
            }

            Section {
                Picker("Division", selection: $divisionId) {
                    Text("Auto (from grade)").tag("")
                    ForEach(divisions) { d in
                        Text(d.name).tag(d.id)
                    }
                }
            } footer: {
                let currentGrade = row.grade
                    .map { String(format: "%.1f", $0) } ?? "—"
                Text("Auto matches by grade. Current grade \(currentGrade).")
                    .font(.gh.caption)
            }

            Section {
                TextField("Hex like #bf0000 or label like Home", text: $kitColour)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Kit colour override")
            } footer: {
                Text("Leave blank to inherit from the player's team.")
                    .font(.gh.caption)
            }
        }
    }

    private func load() async {
        loading = teams.isEmpty
        error = nil
        defer { loading = false }
        do {
            async let teamsTask = convex.listTeams(includeInactive: false)
            async let divisionsTask = convex.listSoccerDivisions()
            let (t, d) = try await (teamsTask, divisionsTask)
            teams = t
            divisions = d.filter { $0.active }
            teamId = row.teamId ?? ""
            divisionId = row.divisionId ?? ""
            kitColour = row.kitColour ?? ""
        } catch let err {
            error = err.localizedDescription
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let payload = AssignmentPayload(
            memberId: row.memberId,
            teamId: teamId.isEmpty ? nil : teamId,
            divisionId: divisionId.isEmpty ? nil : divisionId,
            clearTeam: teamId.isEmpty,
            clearDivision: divisionId.isEmpty,
            kitColour: kitColour.trimmingCharacters(in: .whitespaces).isEmpty
                ? nil
                : kitColour
        )
        // Queue first so the write survives offline. The coordinator
        // attempts a drain right away — if we're online it lands now,
        // otherwise it sticks in the queue.
        if let store = sync.store,
           let data = try? JSONEncoder().encode(payload) {
            do {
                try store.enqueue(
                    kind: .soccerAssignment,
                    title: "Assign \(row.name)",
                    payload: data
                )
                await sync.coordinator?.syncIfOnline()
                onSaved()
                dismiss()
            } catch let err {
                error = err.localizedDescription
            }
        } else {
            error = "Couldn't queue change. Please try again."
        }
    }
}
