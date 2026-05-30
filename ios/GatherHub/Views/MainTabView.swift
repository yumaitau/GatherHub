import SwiftUI

/// The signed-in app shell: Dashboard, Scan, Assets, Events, Profile.
struct MainTabView: View {
    let context: CurrentContext
    @EnvironmentObject private var convex: ConvexService

    var body: some View {
        TabView {
            NavigationStack {
                DashboardView(context: context, convex: convex)
            }
            .tabItem { Label("Home", systemImage: "house") }

            ScanView()
                .tabItem { Label("Scan", systemImage: "qrcode.viewfinder") }

            AssetLookupView()
                .tabItem { Label("Assets", systemImage: "shippingbox") }

            EventListView(context: context)
                .tabItem { Label("Events", systemImage: "calendar") }

            ProfileView(context: context)
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .tint(Color.gh.accent)
    }
}
