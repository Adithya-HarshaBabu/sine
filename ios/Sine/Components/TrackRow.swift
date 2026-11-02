import SwiftUI

struct TrackRow: View {
    @Environment(AppModel.self) private var model
    let track: Track
    var index: Int? = nil
    let onPlay: () -> Void

    var body: some View {
        let playing = model.player.track?.uri == track.uri
        let saved = model.saved[track.uri]
        HStack(spacing: 12) {
            Button(action: onPlay) {
                HStack(spacing: 12) {
                    Artwork(url: track.artworkURL, corner: 4)
                        .frame(width: 48, height: 48)
                        .overlay {
                            if playing && model.player.isPlaying {
                                RoundedRectangle(cornerRadius: 4).fill(.black.opacity(0.45))
                                Image(systemName: "waveform").symbolEffect(.variableColor.iterative)
                                    .foregroundStyle(model.tint.vivid)
                            }
                        }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title)
                            .font(.body.weight(.medium))
                            .foregroundStyle(playing ? model.tint.vivid : .primary)
                            .lineLimit(1)
                        Text(track.artist)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Play \(track.title) by \(track.artist)")

            if model.canLike {
                Button {
                    Task { await model.toggleSaved(track) }
                } label: {
                    Image(systemName: saved == true ? "heart.fill" : "heart")
                        .foregroundStyle(saved == true ? Color.sineGreen : .secondary)
                        .contentTransition(.symbolEffect(.replace))
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                .disabled(saved == nil)
                .accessibilityLabel(saved == true ? "Remove from liked songs" : "Add to liked songs")
            }
            Text(formatTime(track.durationMs))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
