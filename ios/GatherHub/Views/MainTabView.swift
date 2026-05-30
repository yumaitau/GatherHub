import SwiftUI

/// The signed-in app shell: Home, Assets (scan + lookup combined),
/// Events, More (expansive menu), Profile.
struct MainTabView: View {
    let context: CurrentContext
    var onSwitchOrg: () -> Void = {}
    @EnvironmentObject private var convex: ConvexService

    var body: some View {
        TabView {
            NavigationStack {
                DashboardView(context: context, convex: convex)
            }
            .tabItem { Label("Home", systemImage: "house") }

            AssetsView()
                .tabItem { Label("Assets", systemImage: "qrcode.viewfinder") }

            EventCalendarView(context: context)
                .tabItem { Label("Events", systemImage: "calendar") }

            MoreView(context: context)
                .tabItem { Label("More", systemImage: "ellipsis.circle") }

            ProfileView(context: context, onSwitchOrg: onSwitchOrg)
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .tint(Color.gh.accent)
    }
}
