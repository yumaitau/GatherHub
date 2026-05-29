import SwiftUI

/// Lets a user who belongs to more than one club choose the active one.
/// Selecting an org sets it active in Clerk; the resulting JWT then carries the
/// chosen `org_id`, which `sync:*` uses to scope all data.
struct OrgPickerView: View {
    @EnvironmentObject private var auth: AuthService

    var body: some View {
        NavigationStack {
            List(auth.organizations) { org in
                Button {
                    Task { await auth.setActiveOrg(org.id) }
                } label: {
                    HStack {
                        Image(systemName: "building.2")
                            .foregroundStyle(.tint)
                        VStack(alignment: .leading) {
                            Text(org.name).font(.headline)
                            if let slug = org.slug {
                                Text(slug).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if auth.activeOrgId == org.id {
                            Image(systemName: "checkmark").foregroundStyle(.tint)
                        }
                    }
                }
                .tint(.primary)
            }
            .navigationTitle("Choose your club")
        }
    }
}
