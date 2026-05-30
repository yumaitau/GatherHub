import SwiftUI
import YumaBrandKit
import YumaSupportKit

/// Shows the signed-in user, their active club and role, and a sign-out action.
struct ProfileView: View {
    let context: CurrentContext

    @EnvironmentObject private var auth: AuthService
    @State private var isShowingSupport = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        avatar
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.user.displayName).font(.headline)
                            if let email = context.user.email {
                                Text(email).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Club") {
                    LabeledContent("Name", value: context.org.name)
                    if let slug = context.org.slug {
                        LabeledContent("Slug", value: slug)
                    }
                    LabeledContent("Your role", value: context.role.displayName)
                }

                Section {
                    LabeledContent(
                        "Asset management",
                        value: context.role.canManageAssets ? "Allowed" : "View only"
                    )
                } footer: {
                    if !context.role.canManageAssets {
                        Text("Check-out and check-in require a coach, committee, admin, or owner role.")
                    }
                }

                Section("Help") {
                    Button {
                        // Layer in the signed-in user's details before
                        // the support sheet renders so the SnagSpot ticket
                        // identifies who reported the issue.
                        YumaSupport.configure(
                            YumaSupportConfiguration(
                                snagSpotToken: Secrets.snagSpotToken,
                                user: YumaSupportUser(
                                    name: context.user.displayName,
                                    email: context.user.email ?? ""
                                ),
                                customMetadata: [
                                    "app": .string("gatherhub-ios"),
                                    "org_id": .string(context.org.id),
                                    "org_slug": .string(context.org.slug ?? ""),
                                    "role": .string(context.role.rawValue),
                                ],
                                diagnosticsEnabledByDefault: true,
                                fallbackEmail: Secrets.supportEmail
                            )
                        )
                        isShowingSupport = true
                    } label: {
                        Label("Contact support", systemImage: "lifepreserver")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await auth.signOut() }
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                Section {
                    VStack(spacing: 8) {
                        YumaBrandCard(width: 110)
                        Text(YumaBrandKit.copyright)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Profile")
            .yumaSupportSheet(isPresented: $isShowingSupport) { _ in }
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if let urlString = context.user.imageUrl, let url = URL(string: urlString) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.secondary.opacity(0.2)
            }
            .frame(width: 56, height: 56)
            .clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .resizable()
                .frame(width: 56, height: 56)
                .foregroundStyle(.secondary)
        }
    }
}
