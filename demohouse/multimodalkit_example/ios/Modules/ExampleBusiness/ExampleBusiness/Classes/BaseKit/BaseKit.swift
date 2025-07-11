//
//  BaseKit.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/6/11.
//

import Foundation

struct BaseKit {
    static let bundle = Bundle(path: Bundle.main.path(forResource: "ExampleResource", ofType: "bundle") ?? "")!
}

extension UIImage {
    func getBuffer(scale: Double = 1) -> CVPixelBuffer? {
            guard let cgImage else { return nil }

            let width = Int(Double(cgImage.width) * scale)
            let height = Int(Double(cgImage.height) * scale)
            var targetWidth = width
            var targetHeight = height
            if width < 2 || height < 2 { return nil }
            
            var transform = CGAffineTransform.identity
            if imageOrientation == .right {
                targetWidth = height
                targetHeight = width
                transform = transform.translatedBy(x: 0, y: CGFloat(targetHeight)).rotated(by: -.pi / 2)
            } else if imageOrientation == .left {
                targetWidth = height
                targetHeight = width
                transform = transform.translatedBy(x: CGFloat(targetWidth), y: 0).rotated(by: .pi / 2)
            } else {
                
            }

            let attributes: [CFString: Any] = [
                kCVPixelBufferCGImageCompatibilityKey: true,
                kCVPixelBufferCGBitmapContextCompatibilityKey: true,
                kCVPixelBufferIOSurfacePropertiesKey: [String: Any]()
            ]
                
            var pixelBuffer: CVPixelBuffer?
            let status = CVPixelBufferCreate(kCFAllocatorDefault, targetWidth, targetHeight, kCVPixelFormatType_32ARGB, attributes as CFDictionary, &pixelBuffer)

            guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
                return nil
            }

            CVPixelBufferLockBaseAddress(buffer, CVPixelBufferLockFlags(rawValue: 0))
            let pixelData = CVPixelBufferGetBaseAddress(buffer)

            let colorSpace = CGColorSpaceCreateDeviceRGB()
            let context = CGContext(data: pixelData,
                                    width: targetWidth,
                                    height: targetHeight,
                                    bitsPerComponent: 8,
                                    bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                                    space: colorSpace,
                                    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)
            
            context?.concatenate(transform)
            context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

            CVPixelBufferUnlockBaseAddress(buffer, CVPixelBufferLockFlags(rawValue: 0))

            return buffer
        }
}
