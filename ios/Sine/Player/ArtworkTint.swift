import Observation
import SwiftUI
import UIKit

/// Album-colour theming: picks the artwork's dominant vivid colour (same approach as the web app).
@MainActor
@Observable
final class ArtworkTint {
    private(set) var vivid: Color = .white
    private(set) var deep: Color = Color(white: 0.09)
    private(set) var isTinted = false

    private var cache: [URL: (Color, Color)] = [:]
    private var current: URL?

    func update(for url: URL?) async {
        guard url != current else { return }
        current = url
        guard let url else {
            apply(nil)
            return
        }
        if let cached = cache[url] {
            apply(cached)
            return
        }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let image = UIImage(data: data),
              let hsb = Self.dominantHSB(image) else { return }
        let colors = (
            Color(hue: hsb.h, saturation: max(0.45, hsb.s), brightness: 0.9),
            Color(hue: hsb.h, saturation: min(0.6, hsb.s), brightness: 0.24)
        )
        cache[url] = colors
        if current == url { apply(colors) }
    }

    private func apply(_ colors: (Color, Color)?) {
        withAnimation(.easeInOut(duration: 0.9)) {
            vivid = colors?.0 ?? .white
            deep = colors?.1 ?? Color(white: 0.09)
            isTinted = colors != nil
        }
    }

    /// Buckets pixels by hue, weighting saturated mid-tones, so one hue wins instead of a muddy average.
    private static func dominantHSB(_ image: UIImage) -> (h: Double, s: Double)? {
        guard let cg = image.cgImage else { return nil }
        let size = 32
        var pixels = [UInt8](repeating: 0, count: size * size * 4)
        guard let ctx = CGContext(
            data: &pixels, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: size, height: size))

        var buckets: [Int: (w: Double, s: Double, h: Double)] = [:]
        for i in stride(from: 0, to: pixels.count, by: 4) {
            let color = UIColor(red: CGFloat(pixels[i]) / 255, green: CGFloat(pixels[i + 1]) / 255, blue: CGFloat(pixels[i + 2]) / 255, alpha: 1)
            var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0
            color.getHue(&h, saturation: &s, brightness: &b, alpha: nil)
            if b < 0.1 || (b > 0.95 && s < 0.1) { continue }
            let weight = 0.15 + Double(s * s) * (1 - abs(Double(b) - 0.6))
            let key = Int(h * 15)
            let bucket = buckets[key] ?? (0, 0, 0)
            buckets[key] = (bucket.w + weight, bucket.s + Double(s) * weight, bucket.h + Double(h) * weight)
        }
        guard let best = buckets.values.max(by: { $0.w < $1.w }) else { return nil }
        return (best.h / best.w, best.s / best.w)
    }
}
