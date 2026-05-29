import SwiftUI

/// Manual asset lookup by tag id, for when scanning isn't convenient (e.g. the
/// tag id is printed on a sheet). Accepts a bare id, a URL, or a deep link and
/// normalises via `TagParser`.
struct AssetLookupView: View {
    @State private var rawInput = ""
    @State private var tagId: String?
    @State private var invalid = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("tag_ab12cd34ef56 or a tag URL", text: $rawInput)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(lookup)
                    Button("Look up asset", action: lookup)
                        .disabled(rawInput.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text("Find an asset")
                } footer: {
                    Text("Enter a tag id, or paste a scanned QR/NFC value. The Scan tab is usually faster.")
                }

                if invalid {
                    Text("That doesn't contain a valid GatherHub tag id.")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
            .navigationTitle("Assets")
            // iOS 16 navigation: drive a hidden link from `tagId`.
            .background(
                NavigationLink(
                    isActive: Binding(
                        get: { tagId != nil },
                        set: { if !$0 { tagId = nil } }
                    )
                ) {
                    if let id = tagId {
                        AssetDetailView(tagId: id)
                    }
                } label: { EmptyView() }
                .hidden()
            )
        }
    }

    private func lookup() {
        invalid = false
        if let id = TagParser.extractTagId(from: rawInput) {
            tagId = id
        } else {
            invalid = true
        }
    }
}

#Preview {
    AssetLookupView()
}
