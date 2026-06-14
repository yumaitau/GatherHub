import SwiftUI

/// Edits an asset's org-defined custom fields (resolved by category + fleet
/// type on the server). Saves offline through the sync queue; values are
/// JSON-encoded into a single string arg so the mobile Convex client doesn't
/// have to encode an array of objects.
struct AssetCustomFieldsView: View {
    let assetId: String
    let assetName: String

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var defs: [AssetFieldDef] = []
    @State private var values: [String: String] = [:]
    @State private var loading = true
    @State private var saving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if defs.isEmpty {
                    ContentUnavailableView(
                        "No custom fields",
                        systemImage: "slider.horizontal.3",
                        description: Text(
                            "No custom fields are defined for this asset's category or type."
                        )
                    )
                } else {
                    Form {
                        ForEach(defs) { def in
                            fieldRow(def)
                        }
                        if let errorMessage {
                            Section {
                                Text(errorMessage)
                                    .font(.gh.caption)
                                    .foregroundStyle(Color.gh.danger)
                            }
                        }
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
                    Button(saving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving || defs.isEmpty)
                }
            }
            .task { await load() }
        }
    }

    @ViewBuilder
    private func fieldRow(_ def: AssetFieldDef) -> some View {
        let binding = Binding<String>(
            get: { values[def.key] ?? "" },
            set: { values[def.key] = $0 }
        )
        let title = def.label + (def.unit.map { " (\($0))" } ?? "")
        switch def.kind {
        case "boolean":
            Toggle(
                title,
                isOn: Binding(
                    get: { binding.wrappedValue == "true" },
                    set: { binding.wrappedValue = $0 ? "true" : "false" }
                )
            )
        case "select":
            Picker(title, selection: binding) {
                Text("—").tag("")
                ForEach(def.options, id: \.self) { opt in
                    Text(opt).tag(opt)
                }
            }
        case "number":
            HStack {
                Text(title)
                Spacer()
                TextField("", text: binding)
                    .keyboardType(.numbersAndPunctuation)
                    .multilineTextAlignment(.trailing)
            }
        default: // text, date
            HStack {
                Text(title)
                Spacer()
                TextField(def.kind == "date" ? "YYYY-MM-DD" : "", text: binding)
                    .multilineTextAlignment(.trailing)
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let result = try await convex.assetCustomFields(assetId: assetId)
            defs = result.defs
            var seed: [String: String] = [:]
            for a in result.attributes { seed[a.key] = a.value }
            values = seed
        } catch {
            errorMessage = UserFacingError.message(
                error,
                fallback: "Couldn't load custom fields."
            )
        }
    }

    private func save() async {
        saving = true
        errorMessage = nil
        defer { saving = false }
        let kvs = defs
            .map { AssetAttrKV(key: $0.key, value: values[$0.key] ?? "") }
            .filter { !$0.value.isEmpty }
        guard
            let data = try? JSONEncoder().encode(kvs),
            let json = String(data: data, encoding: .utf8)
        else {
            errorMessage = "Couldn't encode values."
            return
        }
        do {
            _ = try sync.enqueue(
                kind: .assetAttributes,
                title: "Custom fields: \(assetName)",
                payload: AssetAttributesPayload(
                    assetId: assetId,
                    attributesJson: json
                )
            )
            await sync.coordinator?.syncIfOnline()
            dismiss()
        } catch {
            errorMessage = UserFacingError.message(
                error,
                fallback: "Couldn't queue the change."
            )
        }
    }
}

// MARK: - DTOs

struct AssetCustomFields: Decodable {
    let defs: [AssetFieldDef]
    let attributes: [AssetAttr]
}

struct AssetFieldDef: Decodable, Identifiable {
    let key: String
    let label: String
    let kind: String
    let options: [String]
    let unit: String?
    let required: Bool
    var id: String { key }
}

struct AssetAttr: Decodable {
    let key: String
    let value: String
}

private struct AssetAttrKV: Encodable {
    let key: String
    let value: String
}
