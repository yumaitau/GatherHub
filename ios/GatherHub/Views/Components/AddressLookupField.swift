import SwiftUI

struct AddressLookupField: View {
    let title: String
    @Binding var text: String
    var defaultAddress: String?
    var showDefaultAction = true

    @State private var suggestions: [AddressSuggestion] = []
    @State private var isSearching = false
    @State private var errorMessage: String?

    private var cleanDefaultAddress: String? {
        guard let value = defaultAddress?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            return nil
        }
        return value
    }

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            TextField(title, text: $text, axis: .vertical)
                .textContentType(.fullStreetAddress)
                .lineLimit(2...)

            if showDefaultAction,
               let cleanDefaultAddress,
               text.trimmingCharacters(in: .whitespacesAndNewlines) != cleanDefaultAddress {
                Button("Use organisation address") {
                    text = cleanDefaultAddress
                    suggestions = []
                }
                .font(.gh.caption)
            }

            if isSearching {
                ProgressView()
                    .controlSize(.small)
            }

            if !suggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(suggestions) { suggestion in
                        Button {
                            text = suggestion.text
                            suggestions = []
                        } label: {
                            Label(suggestion.text, systemImage: "mappin.and.ellipse")
                                .font(.gh.body)
                                .foregroundStyle(Color.gh.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, GHSpacing.sm)
                        }
                        .buttonStyle(.plain)

                        if suggestion.id != suggestions.last?.id {
                            Divider()
                        }
                    }

                    Text("Powered by Google")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                        .padding(.top, GHSpacing.xs)
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.warning)
            }
        }
        .task(id: text) {
            await search(text)
        }
    }

    private func search(_ value: String) async {
        let query = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 3 else {
            suggestions = []
            errorMessage = nil
            return
        }

        do {
            try await Task.sleep(for: .milliseconds(300))
            if Task.isCancelled { return }
            isSearching = true
            errorMessage = nil
            suggestions = try await GoogleAddressLookupService.shared.suggestions(for: query)
        } catch GoogleAddressLookupError.missingKey {
            suggestions = []
            errorMessage = "Google address lookup is not configured."
        } catch is CancellationError {
            errorMessage = nil
        } catch {
            suggestions = []
            errorMessage = "Address lookup unavailable. You can still type a location."
        }
        isSearching = false
    }
}
