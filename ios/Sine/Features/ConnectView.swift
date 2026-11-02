import SwiftUI

struct ConnectView: View {
    @Environment(AppModel.self) private var model
    @State private var working = false

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 28) {
            Spacer()
            SineLogo(size: 84)
            VStack(spacing: 8) {
                Text("Sine").font(.system(size: 44, weight: .bold))
                Text("Your Spotify library, beautifully.")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                working = true
                Task {
                    await model.signIn()
                    working = false
                }
            } label: {
                HStack {
                    if working { ProgressView().tint(.black) }
                    Text("Connect Spotify").fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Color.sineGreen, in: Capsule())
                .foregroundStyle(.black)
            }
            .disabled(working)
            Text("Music plays through Spotify Connect, on the Spotify app or any Spotify device. Playback needs Spotify Premium.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .background(Color(white: 0.05).ignoresSafeArea())
        .alert("Couldn't sign in", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.error ?? "")
        }
    }
}
