import SwiftUI

/// Pre-start fleet inspection checklist. Submits offline through the sync
/// queue: one `fleetInspection` op plus one `fleetDefect` op per flagged item
/// (kept as flat operations so they encode reliably and dedupe individually).
struct FleetPreStartView: View {
    let assetId: String
    let assetName: String

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var items: [ChecklistRow] = ChecklistRow.defaults
    @State private var odometer = ""
    @State private var notes = ""
    @State private var failInspection = false
    @State private var saving = false
    @State private var errorMessage: String?

    private var defectCount: Int {
        items.filter { $0.severity != .ok }.count
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach($items) { $item in
                        Picker(item.label, selection: $item.severity) {
                            ForEach(ChecklistSeverity.allCases, id: \.self) { sev in
                                Text(sev.label).tag(sev)
                            }
                        }
                    }
                } header: {
                    Text("Checklist")
                } footer: {
                    Text(
                        defectCount == 0
                            ? "All items OK."
                            : "\(defectCount) item\(defectCount == 1 ? "" : "s") will be logged as defects."
                    )
                }

                Section("Readings") {
                    TextField("Odometer", text: $odometer)
                        .keyboardType(.numberPad)
                    TextField("Notes", text: $notes, axis: .vertical)
                }

                Section {
                    Toggle("Vehicle unsafe — fail inspection", isOn: $failInspection)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.danger)
                    }
                }
            }
            .navigationTitle(assetName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Submitting…" : "Submit") {
                        Task { await submit() }
                    }
                    .disabled(saving)
                }
            }
        }
    }

    private func submit() async {
        saving = true
        errorMessage = nil
        defer { saving = false }
        let defects = items.filter { $0.severity != .ok }
        let result =
            failInspection
            ? "fail" : (defects.isEmpty ? "pass" : "pass_with_defects")
        do {
            _ = try sync.enqueue(
                kind: .fleetInspection,
                title: "Pre-start: \(assetName)",
                payload: FleetInspectionPayload(
                    assetId: assetId,
                    type: "pre_start",
                    result: result,
                    odometer: Double(odometer),
                    engineHours: nil,
                    notes: notes.isEmpty ? nil : notes,
                    latitude: nil,
                    longitude: nil,
                    accuracy: nil
                )
            )
            for defect in defects {
                _ = try sync.enqueue(
                    kind: .fleetDefect,
                    title: "Defect: \(defect.label)",
                    payload: FleetDefectPayload(
                        assetId: assetId,
                        severity: defect.severity.rawValue,
                        title: defect.label,
                        description: nil
                    )
                )
            }
            await sync.coordinator?.syncIfOnline()
            dismiss()
        } catch {
            errorMessage = UserFacingError.message(
                error,
                fallback: "Couldn't queue the inspection."
            )
        }
    }
}

enum ChecklistSeverity: String, CaseIterable, Hashable {
    case ok
    case minor
    case major
    case critical

    var label: String {
        switch self {
        case .ok: return "OK"
        case .minor: return "Minor"
        case .major: return "Major"
        case .critical: return "Critical"
        }
    }
}

struct ChecklistRow: Identifiable {
    let id = UUID()
    let label: String
    var severity: ChecklistSeverity = .ok

    static let defaults: [ChecklistRow] = [
        "Tyres & wheels",
        "Lights & indicators",
        "Brakes",
        "Fluids & leaks",
        "Mirrors & glass",
        "Horn & wipers",
        "Safety equipment",
        "Body & load security",
    ].map { ChecklistRow(label: $0) }
}
