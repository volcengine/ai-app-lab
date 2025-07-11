//
//  PermissionManager.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import AVFoundation
import Photos
import UserNotifications

public class PermissionManager {
    public static let shared = PermissionManager()
    
    public func askOpenAppSettings(title: String? = nil, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "前往设置", style: .default) { _ in
            self.openAppSettings()
        })
        Responder.topViewController?.present(alert, animated: true)
    }
    
    public func openAppSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
    }
    
    public func requestCamera(_ callback: @escaping (AVAuthorizationStatus) -> Void) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        guard status == .notDetermined else {
            DispatchQueue.main.safeAsync { callback(status) }
            return
        }
        AVCaptureDevice.requestAccess(for: .video) { granted in
            let s = AVCaptureDevice.authorizationStatus(for: .video)
            DispatchQueue.main.safeAsync { callback(s) }
        }
    }
}
