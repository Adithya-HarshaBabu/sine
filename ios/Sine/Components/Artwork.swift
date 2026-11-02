import SwiftUI

struct Artwork: View {
    let url: URL?
    var corner: CGFloat = 6

    var body: some View {
        // Color.clear takes exactly the space offered; the filled image is drawn on top and clipped,
        // so a large image can never widen the layout around it.
        Color.clear
            .overlay {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.3))) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill().transition(.opacity)
                    } else {
                        Rectangle().fill(.white.opacity(0.08))
                            .overlay(Image(systemName: "music.note").foregroundStyle(.white.opacity(0.3)))
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
    }
}

/// The album-colour wash used behind every screen.
struct SineBackground: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        LinearGradient(
            colors: [model.tint.deep, Color(white: 0.05)],
            startPoint: .top,
            endPoint: UnitPoint(x: 0.5, y: 0.55)
        )
        .ignoresSafeArea()
    }
}
