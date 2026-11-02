import SwiftUI

/// The played part of a sine wave, tapering into the playhead.
struct WaveShape: Shape {
    var progress: Double
    var phase: Double
    var amplitude: Double
    var wavelength: Double = 26

    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(amplitude, progress) }
        set {
            amplitude = newValue.first
            progress = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let end = rect.width * min(max(progress, 0), 1)
        guard end > 0 else { return path }
        var x = 0.0
        while x <= end {
            let taper = min(1, (end - x) / 12, x / 12)
            let y = rect.midY + sin(x / wavelength * .pi * 2 - phase) * amplitude * taper
            x == 0 ? path.move(to: CGPoint(x: x, y: y)) : path.addLine(to: CGPoint(x: x, y: y))
            x += 1
        }
        return path
    }
}

/// Seek bar drawn as a sine wave: it ripples while playing and settles flat when paused.
/// Drag to scrub; the seek happens when you let go.
struct WaveProgress: View {
    let positionMs: Int
    let durationMs: Int
    let playing: Bool
    var color: Color = .white
    var large = false
    let onSeek: (Int) -> Void

    @State private var scrub: Double?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var fraction: Double {
        scrub ?? (durationMs > 0 ? Double(positionMs) / Double(durationMs) : 0)
    }

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(paused: !playing || reduceMotion)) { timeline in
                let phase = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate * 4
                let x = geo.size.width * fraction
                ZStack(alignment: .leading) {
                    Path { p in
                        p.move(to: CGPoint(x: x, y: geo.size.height / 2))
                        p.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height / 2))
                    }
                    .stroke(.white.opacity(0.22), style: StrokeStyle(lineWidth: large ? 3 : 2.5, lineCap: .round))

                    WaveShape(progress: fraction, phase: phase, amplitude: playing && scrub == nil ? (large ? 6 : 4) : 0)
                        .stroke(color, style: StrokeStyle(lineWidth: large ? 3 : 2.5, lineCap: .round, lineJoin: .round))
                        .animation(.easeInOut(duration: 0.35), value: playing)

                    Circle()
                        .fill(color)
                        .frame(width: scrub == nil ? (large ? 12 : 9) : 18)
                        .position(x: x, y: geo.size.height / 2)
                        .animation(.spring(duration: 0.2), value: scrub == nil)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { scrub = min(max($0.location.x / geo.size.width, 0), 1) }
                    .onEnded { _ in
                        if let scrub { onSeek(Int(scrub * Double(durationMs))) }
                        scrub = nil
                    }
            )
        }
        .frame(height: large ? 32 : 22)
        .accessibilityElement()
        .accessibilityLabel("Playback position")
        .accessibilityValue(Text(formatTime(positionMs)))
        .accessibilityAdjustableAction { direction in
            let step = direction == .increment ? 10_000 : -10_000
            onSeek(min(max(positionMs + step, 0), durationMs))
        }
    }
}

func formatTime(_ ms: Int) -> String {
    let s = max(0, ms / 1000)
    return String(format: "%d:%02d", s / 60, s % 60)
}
