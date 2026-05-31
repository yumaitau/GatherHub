import SwiftUI

struct AssetLocationSheet: View {
    let title: String
    let actionTitle: String
    let defaultAddress: String?
    let initialLocation: String?
    let onSubmit: (String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var location = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AddressLookupField(
                        title: "Location",
                        text: $location,
                        defaultAddress: defaultAddress
                    )
                } footer: {
                    Text("Use the organisation address or search for the specific place where the asset is moving.")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(actionTitle) {
                        let trimmed = location.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSubmit(trimmed.isEmpty ? nil : trimmed)
                        dismiss()
                    }
                }
            }
            .onAppear {
                if location.isEmpty {
                    location = initialLocation ?? defaultAddress ?? ""
                }
            }
        }
    }
}
