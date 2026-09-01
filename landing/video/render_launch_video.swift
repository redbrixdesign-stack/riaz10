import Foundation
import AVFoundation
import AppKit
import CoreVideo

let project = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let assets = project.appendingPathComponent("src/assets/shots")
let outputDir = project.appendingPathComponent("video/output")
try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
let output = outputDir.appendingPathComponent("beelo-pilot-launch-vertical.mp4")
try? FileManager.default.removeItem(at: output)

let width = 720
let height = 1280
let fps: Int32 = 30
let duration = 30.0

let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 5_000_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
  ]
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let ink = NSColor(calibratedRed: 10/255, green: 10/255, blue: 10/255, alpha: 1)
let paper = NSColor(calibratedRed: 245/255, green: 240/255, blue: 232/255, alpha: 1)
let gold = NSColor(calibratedRed: 253/255, green: 185/255, blue: 19/255, alpha: 1)
let muted = NSColor(calibratedRed: 184/255, green: 179/255, blue: 171/255, alpha: 1)

func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {
  NSFont(name: "Hanken Grotesk", size: size) ?? NSFont.systemFont(ofSize: size, weight: weight)
}

func smooth(_ x: Double) -> CGFloat {
  let v = max(0, min(1, x)); return CGFloat(v * v * (3 - 2 * v))
}

func fade(_ t: Double, _ start: Double, _ end: Double, edge: Double = 0.45) -> CGFloat {
  let inside = smooth((t - start) / edge)
  let outside = smooth((end - t) / edge)
  return min(inside, outside)
}

func drawText(_ text: String, rect: CGRect, size: CGFloat, color: NSColor, weight: NSFont.Weight = .regular, align: NSTextAlignment = .left, alpha: CGFloat = 1, lineHeight: CGFloat? = nil) {
  let p = NSMutableParagraphStyle(); p.alignment = align
  p.lineBreakMode = .byWordWrapping
  p.minimumLineHeight = lineHeight ?? size * 1.12
  p.maximumLineHeight = lineHeight ?? size * 1.12
  let attrs: [NSAttributedString.Key: Any] = [.font: font(size, weight), .foregroundColor: color.withAlphaComponent(alpha), .paragraphStyle: p]
  NSAttributedString(string: text, attributes: attrs).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
}

func drawPill(_ text: String, x: CGFloat, y: CGFloat, w: CGFloat) {
  let rect = CGRect(x: x, y: y, width: w, height: 48)
  NSColor.white.withAlphaComponent(0.06).setFill(); NSBezierPath(roundedRect: rect, xRadius: 24, yRadius: 24).fill()
  NSColor.white.withAlphaComponent(0.12).setStroke(); let path = NSBezierPath(roundedRect: rect, xRadius: 24, yRadius: 24); path.lineWidth = 1; path.stroke()
  drawText(text, rect: CGRect(x: x, y: y + 12, width: w, height: 28), size: 17, color: paper, weight: .medium, align: .center)
}

func screenImage(_ name: String) -> NSImage? { NSImage(contentsOf: assets.appendingPathComponent("\(name).png")) }
let screens = ["home", "draft", "contact", "next", "trip", "myyday"].reduce(into: [String:NSImage]()) { if let i = screenImage($1) { $0[$1] = i } }

func drawScreen(_ name: String, x: CGFloat, y: CGFloat, w: CGFloat, alpha: CGFloat, zoom: CGFloat = 1) {
  guard let image = screens[name] else { return }
  let h = w * 2556 / 1179
  let rw = w * zoom, rh = h * zoom
  let rect = CGRect(x: x - (rw-w)/2, y: y - (rh-h)/2, width: rw, height: rh)
  NSGraphicsContext.current?.saveGraphicsState()
  NSBezierPath(roundedRect: CGRect(x: x-5, y: y-5, width: w+10, height: h+10), xRadius: 42, yRadius: 42).addClip()
  image.draw(in: rect, from: .zero, operation: .sourceOver, fraction: alpha)
  NSGraphicsContext.current?.restoreGraphicsState()
}

func drawFrame(_ t: Double, into buffer: CVPixelBuffer) {
  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
  guard let base = CVPixelBufferGetBaseAddress(buffer), let ctx = CGContext(data: base, width: width, height: height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue) else { return }
  let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = ns
  ink.setFill(); NSBezierPath(rect: CGRect(x: 0, y: 0, width: width, height: height)).fill()

  // 0–4: brand promise
  var a = fade(t, 0, 4)
  if a > 0 {
    gold.withAlphaComponent(a).setFill(); NSBezierPath(ovalIn: CGRect(x: 72, y: 1114, width: 22, height: 22)).fill()
    drawText("Beelo", rect: CGRect(x: 108, y: 1098, width: 300, height: 56), size: 31, color: paper, weight: .semibold, alpha: a)
    drawText("YOUR BUSINESS SHOULD NOT\nLIVE IN YOUR HEAD.", rect: CGRect(x: 70, y: 610, width: 590, height: 300), size: 58, color: paper, weight: .bold, alpha: a, lineHeight: 64)
    drawText("Operational memory for people working alone.", rect: CGRect(x: 72, y: 520, width: 560, height: 70), size: 24, color: muted, alpha: a)
  }

  // 4–8: fragmented toolchain
  a = fade(t, 4, 8)
  if a > 0 {
    drawText("SEVEN TOOLS.", rect: CGRect(x: 70, y: 1010, width: 580, height: 80), size: 54, color: paper, weight: .bold, alpha: a)
    drawText("One person holding it all together.", rect: CGRect(x: 72, y: 938, width: 570, height: 62), size: 27, color: gold, weight: .semibold, alpha: a)
    NSGraphicsContext.current?.saveGraphicsState(); NSGraphicsContext.current?.cgContext.setAlpha(a)
    drawPill("Company diary", x: 70, y: 820, w: 240); drawPill("WhatsApp", x: 330, y: 820, w: 180)
    drawPill("Maps", x: 530, y: 820, w: 120); drawPill("Camera roll", x: 70, y: 750, w: 210)
    drawPill("Notes", x: 300, y: 750, w: 130); drawPill("Receipts", x: 450, y: 750, w: 160)
    drawPill("Mileage app", x: 70, y: 680, w: 205)
    NSGraphicsContext.current?.restoreGraphicsState()
  }

  // 8–13: day context
  a = fade(t, 8, 13)
  if a > 0 {
    drawText("THE RIGHT CONTEXT,\nBEFORE THE NEXT VISIT.", rect: CGRect(x: 48, y: 1032, width: 624, height: 150), size: 38, color: paper, weight: .bold, align: .center, alpha: a, lineHeight: 44)
    let z = 1 + CGFloat(t-8) * 0.006
    drawScreen("home", x: 190, y: 40, w: 340, alpha: a, zoom: z)
  }

  // 13–18: drafts and approval
  a = fade(t, 13, 18)
  if a > 0 {
    drawText("BEELO DRAFTS.", rect: CGRect(x: 48, y: 1072, width: 624, height: 58), size: 42, color: gold, weight: .bold, align: .center, alpha: a)
    drawText("You review. You decide.", rect: CGRect(x: 48, y: 1016, width: 624, height: 48), size: 29, color: paper, weight: .semibold, align: .center, alpha: a)
    drawScreen("draft", x: 190, y: 20, w: 340, alpha: a, zoom: 1 + CGFloat(t-13) * 0.005)
  }

  // 18–23: mileage
  a = fade(t, 18, 23)
  if a > 0 {
    drawText("LESS EVENING ADMIN.", rect: CGRect(x: 48, y: 1070, width: 624, height: 58), size: 40, color: paper, weight: .bold, align: .center, alpha: a)
    drawText("Mileage captured as the work happens.", rect: CGRect(x: 50, y: 1015, width: 620, height: 48), size: 24, color: gold, weight: .semibold, align: .center, alpha: a)
    drawScreen("trip", x: 190, y: 20, w: 340, alpha: a, zoom: 1 + CGFloat(t-18) * 0.005)
  }

  // 23–26: principles
  a = fade(t, 23, 26)
  if a > 0 {
    drawText("BUILT FOR THE PERSON\nDOING THE WORK.", rect: CGRect(x: 62, y: 785, width: 600, height: 180), size: 49, color: paper, weight: .bold, alpha: a, lineHeight: 56)
    drawText("✓  Offline-first", rect: CGRect(x: 72, y: 660, width: 560, height: 48), size: 27, color: gold, weight: .semibold, alpha: a)
    drawText("✓  Human-controlled AI", rect: CGRect(x: 72, y: 595, width: 560, height: 48), size: 27, color: gold, weight: .semibold, alpha: a)
    drawText("✓  Built from real field work", rect: CGRect(x: 72, y: 530, width: 570, height: 48), size: 27, color: gold, weight: .semibold, alpha: a)
  }

  // 26–30: CTA
  a = fade(t, 26, 30, edge: 0.5)
  if a > 0 {
    gold.withAlphaComponent(a).setFill(); NSBezierPath(ovalIn: CGRect(x: 330, y: 1020, width: 60, height: 60)).fill()
    drawText("BEELO", rect: CGRect(x: 70, y: 905, width: 580, height: 85), size: 64, color: paper, weight: .bold, align: .center, alpha: a)
    drawText("Help shape the pilot.", rect: CGRect(x: 70, y: 790, width: 580, height: 70), size: 39, color: paper, weight: .semibold, align: .center, alpha: a)
    drawText("For self-employed home-visit professionals.", rect: CGRect(x: 85, y: 710, width: 550, height: 62), size: 24, color: muted, align: .center, alpha: a)
    gold.withAlphaComponent(a).setFill(); NSBezierPath(roundedRect: CGRect(x: 130, y: 570, width: 460, height: 72), xRadius: 36, yRadius: 36).fill()
    drawText("APPLY AT BEELESTIAL.CO.UK", rect: CGRect(x: 140, y: 592, width: 440, height: 40), size: 20, color: ink, weight: .bold, align: .center, alpha: a)
    drawText("Pilot-stage product", rect: CGRect(x: 70, y: 480, width: 580, height: 42), size: 18, color: muted, align: .center, alpha: a)
  }
  NSGraphicsContext.restoreGraphicsState()
}

let totalFrames = Int(duration * Double(fps))
for frame in 0..<totalFrames {
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
  var pixelBuffer: CVPixelBuffer?
  CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32ARGB, [
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    kCVPixelBufferIOSurfacePropertiesKey as String: [:]
  ] as CFDictionary, &pixelBuffer)
  if let pb = pixelBuffer {
    drawFrame(Double(frame) / Double(fps), into: pb)
    adaptor.append(pb, withPresentationTime: CMTime(value: Int64(frame), timescale: fps))
  }
}
input.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting { semaphore.signal() }
semaphore.wait()
if writer.status == .completed { print(output.path) } else { fputs("Render failed: \(writer.error?.localizedDescription ?? "unknown error")\n", stderr); exit(1) }
