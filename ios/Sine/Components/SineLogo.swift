import SwiftUI

/// The Sine logo: one and a bit periods of a sine wave.
struct SineWaveShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let steps = 60
        for i in 0...steps {
            let t = Double(i) / Double(steps)
            let x = rect.minX + t * rect.width
            let y = rect.midY - sin(t * .pi * 2.4) * rect.height * 0.4
            i == 0 ? path.move(to: CGPoint(x: x, y: y)) : path.addLine(to: CGPoint(x: x, y: y))
        }
        return path
    }
}

struct SineLogo: View {
    var size: CGFloat = 28

    var body: some View {
        SineWaveShape()
            .stroke(Color.sineGreen, style: StrokeStyle(lineWidth: size * 0.12, lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size * 0.7)
    }
}
