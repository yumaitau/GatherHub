import SwiftUI

/// Driver / crew run list for field service (GX-10). Shows the routes assigned
/// to the signed-in user with their ordered stops, cached for offline use.
/// Completing a stop (or raising an exception) is captured with proof and
/// queued through the offline sync coordinator, so it works with no signal.
struct FieldRunsListView: View {
    let canComplete: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment

    @State private var runs: [FieldRun] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading && runs.isEmpty {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error, runs.isEmpty {
                OfflineStateView(
                    title: "Couldn't load your runs",
                    message: error,
                    retry: load
                )
            } else if runs.isEmpty {
                EmptyStateView(
                    title: "No runs assigned",
                    systemImage: "truck.box",
                    message: "Routes assigned to you will appear here."
                )
            } else {
                List {
                    ForEach(runs) { run in
                        Section {
                            ForEach(run.stops) { stop in
                                NavigationLink {
                                    StopDetailView(stop: stop, canComplete: canComplete) {
                                        Task { await load() }
                                    }
                                } label: {
                                    StopRow(stop: stop)
                                }
                            }
                        } header: {
                            Text("\(run.name) · \(run.date)")
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("My runs")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        if runs.isEmpty {
            runs = (try? sync.store?.cachedFieldRuns()) ?? runs
            loading = runs.isEmpty
        }
        error = nil
        do {
            let fresh = try await convex.fieldMyRuns()
            runs = fresh
            try? sync.store?.replaceFieldRuns(fresh)
        } catch {
            if runs.isEmpty {
                self.error = UserFacingError.message(error, fallback: "Couldn't load your runs.")
            }
        }
        loading = false
    }
}

// MARK: - Stop row

private struct StopRow: View {
    let stop: FieldStop

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.xs) {
            HStack {
                Text(stop.title)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Spacer()
                FieldStatusBadge(status: stop.status)
            }
            let subtitle = [stop.customerName, stop.siteName]
                .compactMap { $0 }
                .joined(separator: " · ")
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
            }
        }
        .padding(.vertical, GHSpacing.xxs)
    }
}

private struct FieldStatusBadge: View {
    let status: String

    var body: some View {
        GHBadge(text: label, variant: variant)
    }

    private var label: String {
        switch status {
        case "open": return "Unassigned"
        case "scheduled": return "Scheduled"
        case "en_route": return "En route"
        case "on_site": return "On site"
        case "completed": return "Completed"
        case "exception": return "Exception"
        case "cancelled": return "Cancelled"
        default: return status
        }
    }

    private var variant: GHBadge.Variant {
        switch status {
        case "completed": return .success
        case "exception": return .danger
        case "en_route", "on_site": return .accent
        case "scheduled": return .info
        default: return .muted
        }
    }
}

// MARK: - Stop detail

struct StopDetailView: View {
    let stop: FieldStop
    let canComplete: Bool
    let onChange: () -> Void

    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var signatureName = ""
    @State private var scanRef = ""
    @State private var notes = ""
    @State private var exceptionReason = ""
    @State private var error: String?

    private let exceptionReasons = [
        "Customer not available",
        "Access blocked",
        "Unsafe conditions",
        "Wrong address",
        "Refused on arrival",
    ]

    var body: some View {
        Form {
            Section {
                LabeledContent("Status") {
                    FieldStatusBadge(status: stop.status)
                }
                if let type = stop.jobType {
                    LabeledContent("Type", value: type)
                }
                LabeledContent("Priority", value: stop.priority.capitalized)
                if let customer = stop.customerName {
                    LabeledContent("Customer", value: customer)
                }
                if let site = stop.siteName {
                    LabeledContent("Site", value: site)
                }
                if let address = stop.siteAddress {
                    LabeledContent("Address", value: address)
                }
            }

            if let instructions = stop.instructions, !instructions.isEmpty {
                Section("Instructions") {
                    Text(instructions)
                        .font(.gh.body)
                        .foregroundStyle(Color.gh.ink)
                }
            }

            if stop.isClosed {
                Section {
                    Text(stop.status == "completed"
                        ? "This stop is complete."
                        : "Exception: \(stop.exceptionReason ?? "recorded")")
                        .font(.gh.body)
                        .foregroundStyle(Color.gh.inkSoft)
                }
            } else if canComplete {
                Section("Proof of service") {
                    TextField("Signature / recipient name", text: $signatureName)
                    TextField("Scan reference (bin / asset)", text: $scanRef)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                    Button("Mark complete") { complete() }
                }
                Section("Can't complete?") {
                    Picker("Exception reason", selection: $exceptionReason) {
                        Text("Select…").tag("")
                        ForEach(exceptionReasons, id: \.self) { reason in
                            Text(reason).tag(reason)
                        }
                    }
                    Button("Raise exception") { raiseException() }
                        .disabled(exceptionReason.isEmpty)
                        .foregroundStyle(Color.gh.danger)
                }
            }

            if let error {
                Section {
                    Text(error).foregroundStyle(Color.gh.danger)
                }
            }
        }
        .navigationTitle(stop.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func complete() {
        do {
            try sync.enqueue(
                kind: .fieldCompleteJob,
                title: "Complete \(stop.title)",
                payload: FieldCompleteJobPayload(
                    jobId: stop.id,
                    signatureName: signatureName.isEmpty ? nil : signatureName,
                    scanRef: scanRef.isEmpty ? nil : scanRef,
                    notes: notes.isEmpty ? nil : notes
                )
            )
            onChange()
            dismiss()
        } catch {
            self.error = UserFacingError.message(error, fallback: "Couldn't queue completion.")
        }
    }

    private func raiseException() {
        do {
            try sync.enqueue(
                kind: .fieldRaiseException,
                title: "Exception: \(stop.title)",
                payload: FieldExceptionPayload(
                    jobId: stop.id,
                    exceptionReason: exceptionReason,
                    notes: notes.isEmpty ? nil : notes
                )
            )
            onChange()
            dismiss()
        } catch {
            self.error = UserFacingError.message(error, fallback: "Couldn't queue exception.")
        }
    }
}
