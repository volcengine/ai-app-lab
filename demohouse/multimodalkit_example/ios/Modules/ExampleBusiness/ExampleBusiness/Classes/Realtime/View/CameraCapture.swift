//
//  CameraCapture.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/6/12.
//

import Foundation
import AVFoundation

public protocol CameraCaptureDelegate: AnyObject {
    func videoCapture(_ capture: CameraCapture, didCaptureVideoFrame: CMSampleBuffer)
}

public class CameraCapture: NSObject {
    
    public private(set) var previewLayer: AVCaptureVideoPreviewLayer?
    public weak var delegate: CameraCaptureDelegate?
    public private(set) var videoInput: AVCaptureDeviceInput?
    public var position: AVCaptureDevice.Position? { videoInput?.device.position }
    public private(set) var outputSize: CMVideoDimensions?
    
    let log = Log("camera")
    let queue = DispatchQueue(label: "multimodal.camera.capture")
    
    let captureSession = AVCaptureSession()
    let videoOutput = AVCaptureVideoDataOutput()
    let photoOutput = AVCapturePhotoOutput()
    var sessionPreset: AVCaptureSession.Preset { captureSession.sessionPreset }
    
    public func setup() -> Bool {
        registerNotification()
        captureSession.beginConfiguration()
        defer {
            captureSession.commitConfiguration()
        }
        captureSession.sessionPreset = .photo
        
        guard let device = AVCaptureDevice.default(for: .video) else {
            log.error("get device failed")
            return false
        }
        videoInput = try? AVCaptureDeviceInput(device: device)
        guard let videoInput else {
            log.error("get capture input failed")
            return false
        }

        if captureSession.canAddInput(videoInput) {
            captureSession.addInput(videoInput)
        } else {
            log.error("add capture input failed")
            return false
        }

        let previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.connection?.videoOrientation = .portrait
        self.previewLayer = previewLayer

        let settings: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: NSNumber(value: kCVPixelFormatType_32BGRA)
        ]

        videoOutput.videoSettings = settings
        videoOutput.alwaysDiscardsLateVideoFrames = false
        videoOutput.setSampleBufferDelegate(self, queue: queue)
        if captureSession.canAddOutput(videoOutput) {
            captureSession.addOutput(videoOutput)
        } else {
            log.error("add video output failed")
            return false
        }
        videoOutput.connection(with: .video)?.videoOrientation = .portrait
        
        if captureSession.canAddOutput(photoOutput) {
            captureSession.addOutput(photoOutput)
        } else {
            log.error("add photo output failed")
            return false
        }

        do {
            try device.lockForConfiguration()
            device.focusMode = .continuousAutoFocus
            device.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5)
            device.exposureMode = .continuousAutoExposure
            device.unlockForConfiguration()
        } catch {
            log.error("device config failed \(error)")
            return false
        }
        return true
    }
    
    public func start() {
        if !captureSession.isRunning {
            DispatchQueue.global().async { [weak self] in
                self?.captureSession.startRunning()
            }
        }
    }

    public func setFocus(to focus: Float) {
        guard let videoInput else { return }
        let maxZoomFactor = videoInput.device.maxAvailableVideoZoomFactor
        let minZoomFactor = videoInput.device.minAvailableVideoZoomFactor
        let actureFactor = min(max(minZoomFactor, Double(focus)), maxZoomFactor)
        do {
            try videoInput.device.lockForConfiguration()
            videoInput.device.ramp(toVideoZoomFactor: actureFactor, withRate: 10)
            videoInput.device.unlockForConfiguration()
        } catch {
            print("Failed to lock device for configuration: \(error)")
        }
    }
    
    public func stop() {
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }
    
    public func switchCamera() {
        captureSession.beginConfiguration()
        defer {
            captureSession.commitConfiguration()
        }
        
        let curPosition = videoInput?.device.position
        
        var newPosition: AVCaptureDevice.Position
        if curPosition == .back {
            newPosition = .front
        } else {
            newPosition = .back
        }
        
        guard let newDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: newPosition) else {
            log.error("no camrea device for \(newPosition)")
            return
        }
        guard let newInput = try? AVCaptureDeviceInput(device: newDevice) else { return }
        if let curInput = self.videoInput {
            captureSession.removeInput(curInput)
        }
        if captureSession.canAddInput(newInput) {
            captureSession.addInput(newInput)
            self.videoInput = newInput
        } else {
            log.error("switch camera can't add")
        }
        
        if let connection = videoOutput.connection(with: .video) {
            connection.videoOrientation = .portrait
        }
    }
    
    private func registerNotification() {
        NotificationCenter.default.addObserver(self, selector: #selector(onCaptureSessionError(_:)), name: .AVCaptureSessionRuntimeError, object: nil)
    }
    
    @objc private func onCaptureSessionError(_ notification: Notification) {
        if let error = notification.userInfo?[AVCaptureSessionErrorKey] as? AVError {
            log.error("session runtime error \(error)")
        }
    }
}

extension CameraCapture: AVCaptureVideoDataOutputSampleBufferDelegate {
    public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        
        if outputSize == nil {
            if let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
                let width = Int32(CVPixelBufferGetWidth(buffer))
                let height = Int32(CVPixelBufferGetHeight(buffer))
                outputSize = CMVideoDimensions(width: width, height: height)
            }
        }
        
        delegate?.videoCapture(self, didCaptureVideoFrame: sampleBuffer)
    }
}
