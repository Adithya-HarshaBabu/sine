import SwiftUI

struct MiniPlayer: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let player = model.player
        if let track = player.track {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Artwork(url: track.artworkURL, corner: 6)
                        .frame(width: 44, height: 44)
                        .id(track.artworkURL)
                        .transition(.opacity)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        HStack(spacing: 4) {
                            if let device = player.device {
                                Image(systemName: device.symbol).foregroundStyle(model.tint.vivid)
                                Text(device.name).lineLimit(1)
                            } else {
                                Text(track.artist).lineLimit(1)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Button {
                        Task { await player.togglePlay() }
                    } label: {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title2)
                            .contentTransition(.symbolEffect(.replace))
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
                    Button {
                        Task { await player.next() }
                    } label: {
                        Image(systemName: "forward.fill").font(.title3).frame(width: 36, height: 44)
                    }
                    .accessibilityLabel("Next")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

                TimelineView(.periodic(from: .now, by: 0.5)) { context in
                    GeometryReader { geo in
                        let fraction = player.durationMs > 0 ? Double(player.progress(at: context.date)) / Double(player.durationMs) : 0
                        Capsule().fill(model.tint.vivid).frame(width: geo.size.width * fraction, height: 2)
                    }
                    .frame(height: 2)
                }
                .padding(.horizontal, 12)
            }
            .foregroundStyle(.white)
            .background(
                ZStack {
                    model.tint.deep
                    Color.black.opacity(0.2)
                }
                .shadow(color: .black.opacity(0.4), radius: 12, y: 4)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
            .contentShape(Rectangle())
            .onTapGesture { model.showNowPlaying = true }
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Opens now playing")
        }
    }
}
