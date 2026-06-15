import SwiftUI

/// Shows one waste load's summary plus stage-appropriate actions:
/// - scheduled → Record pickup
/// - picked_up / in_transit → Record arrival
/// - always → Add note
struct WasteLoadDetailView: View {
    let load: WasteLoadSummary

    @State private var activeSheet: Sheet?

    private enum Sheet: Identifiable {
        case pickup
        case arrival
        case note

        var id: Int {
            switch self {
            case .pickup: return 0
            case .arrival: return 1
            case .note: return 2
            }
        }
    }

    var body: some View {
        List {
            Section {
                LabeledContent("Status") {
                    Label(load.status.displayName, systemImage: load.status.systemImage)
                }
                if let reference = load.reference, !reference.isEmpty {
                    LabeledContent("Reference", value: reference)
                }
                if let stream = load.streamName, !stream.isEmpty {
                    LabeledContent("Stream", value: stream)
                }
                if let container = load.container, !container.isEmpty {
                    LabeledContent("Container", value: container)
                }
                if let date = load.scheduledDate {
                    LabeledContent("Scheduled") {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                    }
                }
            }

            Section("Chain of custody") {
                if let consignor = load.consignor, !consignor.isEmpty {
                    LabeledContent("Consignor", value: consignor)
                }
                if let receiver = load.plannedReceiver, !receiver.isEmpty {
                    LabeledContent("Planned receiver", value: receiver)
                }
                if let amount = load.pickupAmount {
                    LabeledContent("Picked up") {
                        Text(amountText(amount, unit: load.pickupUnit))
                    }
                }
                if let amount = load.arrivalAmount {
                    LabeledContent("Arrived") {
                        Text(amountText(amount, unit: load.arrivalUnit))
                    }
                }
            }

            if load.flaggedDiscrepancy {
                Section {
                    Label("Discrepancy flagged", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.gh.warning)
                    if let flags = load.discrepancyFlags, !flags.isEmpty {
                        ForEach(flags, id: \.self) { flag in
                            Text(flag)
                                .font(.gh.caption)
                                .foregroundStyle(Color.gh.inkSoft)
                        }
                    }
                }
            }

            Section("Actions") {
                if load.status.awaitsPickup {
                    Button {
                        activeSheet = .pickup
                    } label: {
                        Label("Record pickup", systemImage: "shippingbox")
                    }
                }
                if load.status.awaitsArrival {
                    Button {
                        activeSheet = .arrival
                    } label: {
                        Label("Record arrival", systemImage: "mappin.and.ellipse")
                    }
                }
                Button {
                    activeSheet = .note
                } label: {
                    Label("Add note", systemImage: "note.text")
                }
            }
        }
        .navigationTitle(load.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .pickup:
                WasteCaptureView(mode: .pickup, load: load)
            case .arrival:
                WasteCaptureView(mode: .arrival, load: load)
            case .note:
                WasteAddNoteView(load: load)
            }
        }
    }

    private func amountText(_ amount: Double, unit: WasteUnit?) -> String {
        let formatted = amount.formatted(.number.precision(.fractionLength(0...2)))
        if let unit {
            return "\(formatted) \(unit.shortLabel)"
        }
        return formatted
    }
}
