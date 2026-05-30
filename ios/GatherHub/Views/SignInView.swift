import SwiftUI
import Clerk

/// Sign-in entry point.
///
/// Authentication is fully delegated to Clerk's prebuilt SwiftUI
/// component (`AuthView`). The local screen is just a branded splash +
/// a single "Sign in" button that presents Clerk's flow as a sheet.
/// Clerk handles password / email-code / OAuth / MFA / passkey, so we
/// don't duplicate any of that here.
struct SignInView: View {
    @Environment(Clerk.self) private var clerk
    @EnvironmentObject private var auth: AuthService
    @State private var isPresentingAuth = false

    var body: some View {
        VStack(spacing: GHSpacing.huge) {
            Spacer()

            VStack(spacing: GHSpacing.lg) {
                // AppIcon assets cannot be loaded as regular images; iOS
                // reserves them for the home-screen icon. We ship a parallel
                // LogoMark imageset that contains the same artwork so we can
                // render it in-app.
                Image("LogoMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(Color.gh.hairline, lineWidth: 1)
                    )
                Text("GatherHub")
                    .font(.gh.display)
                    .foregroundStyle(Color.gh.inkStrong)
                Text("Field ops for your club.")
                    .font(.gh.body)
                    .foregroundStyle(Color.gh.inkSoft)
            }

            VStack(spacing: GHSpacing.md) {
                Button {
                    isPresentingAuth = true
                } label: {
                    Text("Sign in")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.gh(.primary))

                if let error = auth.lastError {
                    Text(error)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.danger)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, GHSpacing.pageInset)

            Spacer()

            Text("Use your club account. Ask a committee member for an invite.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
                .multilineTextAlignment(.center)
                .padding(.horizontal, GHSpacing.pageInset)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.gh.paper.ignoresSafeArea())
        .sheet(isPresented: $isPresentingAuth) {
            // Clerk's hosted experience handles every credential type
            // configured for the tenant (password, email code, OAuth,
            // SSO, passkeys, MFA). AuthService.startObservingClerk()
            // tracks the underlying Clerk @Observable and mirrors
            // session changes into our @Published state — no manual
            // refresh on dismiss required.
            NavigationStack {
                AuthView(mode: .signInOrUp, isDismissable: true)
            }
        }
        // Clerk drives the transition: once `clerk.user` is non-nil the
        // RootView swaps screens and this sheet is torn down with the
        // view. We also close the sheet explicitly so the dismissal feels
        // immediate rather than waiting on the parent.
        .onChange(of: clerk.user?.id) { _, new in
            if new != nil { isPresentingAuth = false }
        }
    }
}

#Preview {
    SignInView().environmentObject(AuthService())
}
