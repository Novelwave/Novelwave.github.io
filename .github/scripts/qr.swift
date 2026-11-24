// Prints the QR code for a URL as `viewBox|path`, the two attributes an inline <svg> needs: one
// square per dark module, each row's runs merged, with a one-module quiet zone. Error correction M,
// as every code on the site uses. localize_home.py runs it for a URL it hasn't drawn before.
//     swift .github/scripts/qr.swift "https://apps.apple.com/app/id6720100886?pt=122786304&ct=web-qr"
import CoreImage
import Foundation

let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(CommandLine.arguments[1].data(using: .utf8), forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
let image = filter.outputImage!
let width = Int(image.extent.width), height = Int(image.extent.height)
var pixels = [UInt8](repeating: 0, count: width * height * 4)
CIContext().render(image, toBitmap: &pixels, rowBytes: width * 4, bounds: image.extent, format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())

var path = ""
for y in 0..<height {
    var x = 0
    while x < width {
        guard pixels[(y * width + x) * 4] < 128 else { x += 1; continue }
        var run = 1
        while x + run < width, pixels[(y * width + x + run) * 4] < 128 { run += 1 }
        path += "M\(x) \(y)h\(run)v1h-\(run)z"
        x += run
    }
}
print("0 0 \(width) \(height)|\(path)")
