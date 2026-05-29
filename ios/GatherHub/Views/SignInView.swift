import SwiftUI

/// Sign-in entry point.
///
/// This scaffold ships a minimal email/password form wired to
/// `AuthService.signIn`. For production, prefer Clerk's prebuilt SwiftUI auth
/// experience, which handles OAuth, email codes, MFA, and sign-up out of the
/// box. To use it, replace the body with Clerk's component, e.g.:
///
/// ```swift
/// import Clerk
/// // Present Clerk's prebuilt flow:
/// AuthView()   // exact type name depends on the SDK version
/// ```
struct SignInView: View {
    @EnvironmentObject private var auth: AuthService

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "shippingbox.and.arrow.backward.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(.tint)
                Text("GatherHub")
                    .font(.largeTitle.bold())
                Text("Field ops for your club")
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .textFieldStyle(.roundedBorder)

                Button {
                    Task {
                        isSubmitting = true
                        await auth.signIn(email: email, password: password)
                        isSubmitting = false
                    }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Sign in")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(email.isEmpty || password.isEmpty || isSubmitting)
            }
            .padding(.horizontal)

            if let error = auth.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer()
            Text("Use your club account. Ask a committee member for an invite.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding()
    }
}

#Preview {
    SignInView().environmentObject(AuthService())
}
