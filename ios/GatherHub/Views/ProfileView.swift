import SwiftUI

/// Shows the signed-in user, their active club and role, and a sign-out action.
struct ProfileView: View {
    let context: CurrentContext

    @EnvironmentObject private var auth: AuthService

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

                Section {
                    Button(role: .destructive) {
                        Task { await auth.signOut() }
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Profile")
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
