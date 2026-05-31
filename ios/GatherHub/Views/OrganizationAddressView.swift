import SwiftUI

struct OrganizationAddressView: View {
    let initialAddress: String?

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var address = ""
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var saved = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                AddressLookupField(
                    title: "Default organisation address",
                    text: $address,
                    showDefaultAction: false
                )
            } footer: {
                Text("Used as the default location for assets, events, and asset movements when no specific location is entered.")
            }

            Section {
                Button(action: save) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save default address")
                    }
                }
                .disabled(isSaving)

                if saved {
                    Label("Saved", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Color.gh.success)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(Color.gh.danger)
                }
            }
        }
        .navigationTitle("Organisation address")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .overlay {
            if isLoading {
                ProgressView("Loading…")
            }
        }
    }

    private func load() async {
        guard address.isEmpty else { return }
        address = initialAddress ?? ""
        let hasCachedLocationDefaults = (try? sync.store?.hasCachedLocationDefaults()) ?? false
        if let cached = try? sync.store?.cachedLocationDefaults() {
            address = cached.defaultAddress ?? ""
        }
        isLoading = !hasCachedLocationDefaults
        defer { isLoading = false }
        do {
            let defaults = try await convex.locationDefaults()
            address = defaults.defaultAddress ?? ""
            try? sync.store?.replaceLocationDefaults(defaults)
        } catch {
            if !hasCachedLocationDefaults && address.isEmpty {
                errorMessage = UserFacingError.message(error, fallback: "Couldn't load the default address.")
            }
        }
    }

    private func save() {
        Task {
            isSaving = true
            saved = false
            errorMessage = nil
            defer { isSaving = false }
            do {
                let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
                let defaultAddress = trimmed.isEmpty ? nil : trimmed
                try sync.enqueue(
                    kind: .orgDefaultAddress,
                    title: "Update organisation address",
                    payload: OrgDefaultAddressPayload(defaultAddress: defaultAddress)
                )
                try? sync.store?.replaceLocationDefaults(
                    LocationDefaults(defaultAddress: defaultAddress)
                )
                await sync.coordinator?.syncIfOnline()
                saved = true
            } catch {
                errorMessage = UserFacingError.message(error, fallback: "Couldn't queue the default address.")
            }
        }
    }
}
