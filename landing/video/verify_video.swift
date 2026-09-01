import Foundation
import AVFoundation
import AppKit

let url = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  .appendingPathComponent("video/output/beelo-pilot-launch-vertical.mp4")
let asset = AVURLAsset(url: url)
let semaphore = DispatchSemaphore(value: 0)
Task {
  do {
    let duration = try await asset.load(.duration)
    let tracks = try await asset.loadTracks(withMediaType: .video)
    guard let track = tracks.first else { throw NSError(domain: "BeeloVideo", code: 1) }
    let size = try await track.load(.naturalSize)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    let cg = try await generator.image(at: CMTime(seconds: 15, preferredTimescale: 600)).image
    let rep = NSBitmapImageRep(cgImage: cg)
    let png = rep.representation(using: .png, properties: [:])!
    try png.write(to: url.deletingLastPathComponent().appendingPathComponent("beelo-pilot-launch-preview.png"))
    print("duration=\(CMTimeGetSeconds(duration)) size=\(Int(size.width))x\(Int(size.height))")
  } catch { fputs("Verification failed: \(error)\n", stderr) }
  semaphore.signal()
}
semaphore.wait()
